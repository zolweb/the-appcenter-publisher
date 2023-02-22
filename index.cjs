#!/usr/bin/env node

/* eslint-disable no-console */
// Imports
const { prompt } = require('enquirer');
const { validateProjectConfig, getConfigObject, printErrorConsoleMessage} = require('./helpers/commonHelpers');
const { manageGitFlow, manageGitBranches } = require('./helpers/gitHelpers');
const { triggerAppCenterBuild, createAppCenterDistributionGroups, updateAppCenterBranchConfig,
  manageEnvironmentVariables
} = require('./helpers/appCenterHelpers');
const {getAppCenterBranchConfig, postAppCenterBranchConfig, putAppCenterBranchConfig} = require("./services/appCenterService");
const ora = require("ora");

const [, , ...args] = process.argv;

const SCRIPT_PARAMS = {
  INIT_CONFIG: '--init-config',
  UPDATE_CONFIG: '--update-config',
  CI_MODE: '--ci',
  VAR_CONFIG: '--add-variable',
};

const PLATFORMS = ['ios', 'android'];
const ENVIRONMENTS = ['staging', 'pre-prod', 'prod'];

const deployPromptQuestions = [
  {
    type: 'multiselect',
    name: 'platform',
    message: 'Select the platform(s) for your build',
    choices: PLATFORMS,
    validate: (choices) => (choices.length === 0 ? 'You need to choose at lease one platform to start building' : true),
  },
  {
    type: 'select',
    name: 'branch',
    message: 'Select the environment you want your app built for',
    choices: ENVIRONMENTS,
  },
];

const triggerDeployScript = async ({isCi, platformParam, branchParam}) => {
  const CONFIG = getConfigObject();
  let platform = platformParam;
  let branch = branchParam;
  try {
    if(!isCi) {
      // Get inputs from user
      const userResponse = await prompt(deployPromptQuestions);
      platform = userResponse.platform;
      branch = userResponse.branch;
    }
    // Run all the git commands to manage the versionning
    await manageGitFlow(branch, CONFIG);
    // Trigger AppCenter build via API call
    triggerAppCenterBuild(platform, branch);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const triggerInitConfigScript = async () => {
  // Check if all branches exists on repo otherwise create them
  manageGitBranches();
  // Use Appcenter API to create groups
  await createAppCenterDistributionGroups();
  // Use AppCenter API to create the config for each git branch
  await updateAppCenterBranchConfig();
};

const triggerUpdateConfigScript = () => { };

const triggerVariableConfigScript = async () => {
  //TODO for new variable copy .env.js in post-clone script
  const allProjectVariables = await manageEnvironmentVariables();
  const CONFIG = getConfigObject();
  let stagingVariablesToAdd = [];
  let preprodVariablesToAdd = [];
  let prodVariablesToAdd = [];
  // get staging env variable
  const getDevelopBranchConfig = await getAppCenterBranchConfig(CONFIG.appCenter.appName.android, CONFIG.appCenter.userName, CONFIG.git.branches.staging)
  const developVariables = getDevelopBranchConfig?.data?.environmentVariables?.reduce((acc, {name, value}) => {
    return {...acc, [name]: value}
  }, {});
  // get preprod env variable
  const getPreprodBranchConfig = await getAppCenterBranchConfig(CONFIG.appCenter.appName.android, CONFIG.appCenter.userName, CONFIG.git.branches["pre-prod"])
  const prepropVariables = getPreprodBranchConfig?.data?.environmentVariables?.reduce((acc, {name, value}) => {
    return {...acc, [name]: value}
  }, {});
  // get prod env variable
  const getProdBranchConfig = await getAppCenterBranchConfig(CONFIG.appCenter.appName.android, CONFIG.appCenter.userName, CONFIG.git.branches.prod)
  const prodVariables = getProdBranchConfig?.data?.environmentVariables?.reduce((acc, {name, value}) => {
    return {...acc, [name]: value}
  }, {});
  //for each values in env.js
  for (const variable of allProjectVariables) {
    //   //ask user if he wants to update variable value in appCenter
    const updateVariables = await prompt({
      type: 'confirm',
      name: 'doUpdate',
      message: `Do you want to update "${variable}" values?`
    })
    if (updateVariables.doUpdate) {
      // For each values, display value for staging env and ask if user wants the new value
      const newStagingValue = await prompt({
        type: 'input',
        name: 'newValue',
        initial: developVariables?.[variable],
        message: `New staging value :`
      })
      console.log("newValue", newStagingValue)
      stagingVariablesToAdd = stagingVariablesToAdd?.concat([{name: variable, value: newStagingValue.newValue}])
      // For each values, display value for preprod env and ask if user wants the new value
      const newPreprodValue = await prompt({
        type: 'input',
        name: 'newValue',
        initial: prepropVariables?.[variable],
        message: `New preprod value :`
      })
      console.log("newValue", newPreprodValue)
      preprodVariablesToAdd = preprodVariablesToAdd?.concat([{name: variable, value: newPreprodValue.newValue}])
      // For each values, display value for prod env and ask if user wants the new value
      const newProdValue = await prompt({
        type: 'input',
        name: 'newValue',
        initial: prodVariables?.[variable],
        message: `New prod value :`
      })
      console.log("newValue", newProdValue)
      prodVariablesToAdd = prodVariablesToAdd?.concat([{name: variable, value: newProdValue.newValue}])
    }
    else {
      //TODO add variable and its value in toAdd Lists
    }
  }
  // if some values has changed, send them to appCenter
  const branchConfigLoader = ora().start(`\x1b[1mUpdate environement variables\x1b[0m\n`);
  try {
    // Send API Call
    console.log("appName", CONFIG.appCenter.appName.ios)
    console.log("userName", CONFIG.appCenter.userName)
    console.log("branch", CONFIG.git.branches.staging)
    console.log("config", {
      ...getDevelopBranchConfig?.data,
      environmentVariables: stagingVariablesToAdd,
    })
    const iosStagingConfigQueryRes = await putAppCenterBranchConfig(
        CONFIG.appCenter.appName.ios,
        CONFIG.appCenter.userName,
        CONFIG.git.branches.staging,
        {
          trigger: getDevelopBranchConfig?.data?.trigger,
          testsEnabled: getDevelopBranchConfig?.data?.testsEnabled,
          badgeIsEnabled: getDevelopBranchConfig?.data?.badgeIsEnabled,
          toolsets: getDevelopBranchConfig?.data?.toolsets,
          environmentVariables: stagingVariablesToAdd,
        });
    if ([200, 201].includes(iosStagingConfigQueryRes.status)) {
      branchConfigLoader.succeed(`\x1b[1m Staging ios env variables updated with success !\x1b[0m`);
    }
  } catch (error) {
    branchConfigLoader.fail(`Could not update variables\n`);
    // eslint-disable-next-line no-console
    console.error('ERR ', error?.response?.status, error?.response?.data);
  }
}

const validateCIParams = ({platform, env}) => {
  if(platform && !PLATFORMS?.includes(platform)) {
    printErrorConsoleMessage(`platform param is incorrect, possible values are : ${PLATFORMS?.join(' or ')}. Leave empty for both`);
    process.exit(1);
  }
  if(env && !ENVIRONMENTS?.includes(env)) {
    printErrorConsoleMessage(`env param is incorrect, possible values are : ${ENVIRONMENTS?.join(' or ')}.`);
    process.exit(1);
  }
}

async function startScript() {
  // First need to check if project config file is valid
  validateProjectConfig();
  // Check if user specified arguments
  const isInitConfig = args.includes(SCRIPT_PARAMS.INIT_CONFIG);
  const isUpdateConfig = args.includes(SCRIPT_PARAMS.UPDATE_CONFIG);
  const isCI = args.includes(SCRIPT_PARAMS.CI_MODE);
  const isVariableConfig = args.includes(SCRIPT_PARAMS.VAR_CONFIG);

  if (isInitConfig) {
    return triggerInitConfigScript();
  }

  if (isUpdateConfig) {
    return triggerUpdateConfigScript();
  }

  if( isVariableConfig) {
    return triggerVariableConfigScript();
  }

  if (isCI) {
    const defaultPlatform = ['android', 'ios'];
    const defaultEnv = 'staging';
    const platform = args.find((item) => item?.includes('platform'))?.split(':')?.pop();
    const env = args.find((item) => item?.includes('env'))?.split(':')?.pop();
    validateCIParams({platform, env});
    return triggerDeployScript({
      isCi: true,
      platformParam: platform ? [platform] : defaultPlatform,
      branchParam: env || defaultEnv
    });
  }

  return triggerDeployScript({isCi: false});
}

startScript();
