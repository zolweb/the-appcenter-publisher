#!/usr/bin/env node
/* eslint-disable no-console */

// Imports
const { prompt } = require('enquirer');
const { validateProjectConfig, getConfigObject, printErrorConsoleMessage, union} = require('./helpers/commonHelpers');
const { manageGitFlow, manageGitBranches } = require('./helpers/gitHelpers');
const { triggerAppCenterBuild, createAppCenterDistributionGroups, createAppCenterBranchConfig,
  manageEnvironmentVariables, retrieveEnvConfig, handleUpdateConfig
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
  await createAppCenterBranchConfig();
};

const triggerUpdateConfigScript = async () => {
  // // Check if all branches exists on repo otherwise create them
  // manageGitBranches();
  // // Create groups (skip if already exists)
  // await createAppCenterDistributionGroups();
};

const askForNewVariableValue = async (varList, currentVar, env) => {
  const askForValue = await prompt({
    type: 'input',
    name: 'newValue',
    initial: varList?.find(({name}) => name === currentVar)?.value,
    message: `New ${env} value :`
  })
  if(varList?.map(({name}) => name)?.includes(currentVar)) {
    return varList?.map(({name, value}) => {
      if(name === currentVar) {
        return {name, value: askForValue.newValue}
      }
      return {name, value}
    })
  }
  return varList?.concat([{name: currentVar, value: askForValue.newValue}])

}

const triggerVariableConfigScript = async () => {
  //Copy .env.js in post-clone script and get project variables
  const allProjectVariables = await manageEnvironmentVariables();

  // get appCenter config
  const stagingAndroidConfig = await retrieveEnvConfig('staging', 'android') || [];
  const stagingIosConfig = await retrieveEnvConfig('staging', 'ios') || [];
  const preprodAndroidConfig = await retrieveEnvConfig('pre-prod', 'android') || [];
  const preprodIosConfig = await retrieveEnvConfig('pre-prod', 'ios') || [];
  const prodAndroidConfig = await retrieveEnvConfig('prod', 'android') || [];
  const prodIosConfig = await retrieveEnvConfig('prod', 'ios') || [];

  // variables and their values in appCenter config
  let stagingVariables = union(stagingAndroidConfig?.environmentVariables || [], stagingIosConfig?.environmentVariables || []);
  let preprodVariables = union(preprodAndroidConfig?.environmentVariables || [], preprodIosConfig?.environmentVariables || []);
  let prodVariables = union(prodAndroidConfig?.environmentVariables || [], prodIosConfig?.environmentVariables || []);

  //for each variables in env.js
  for (const variable of allProjectVariables) {
    //ask user if they want to update variable value in appCenter
    const updateVariables = await prompt({
      type: 'confirm',
      name: 'doUpdate',
      message: `Do you want to update "${variable}" values?`
    })
    if (updateVariables.doUpdate) {
      // ask for the new value
      stagingVariables = await askForNewVariableValue(stagingVariables, variable, 'staging');
      preprodVariables = await askForNewVariableValue(preprodVariables, variable, 'pre-prod');
      prodVariables = await askForNewVariableValue(prodVariables, variable, 'prod');
    }
  }
  // Send new values to appCenter for ios and android app and for each environment
  const newStagingAndroidConfig = {...stagingAndroidConfig, environmentVariables: stagingVariables};
  const newStagingIosConfig = {...stagingAndroidConfig, environmentVariables: stagingVariables};
  await handleUpdateConfig('staging','ios', newStagingIosConfig);
  await handleUpdateConfig('staging','android', newStagingAndroidConfig);
  const newPreprodAndroidConfig = {...preprodAndroidConfig, environmentVariables: preprodVariables};
  const newPreprodIosConfig = {...preprodIosConfig, environmentVariables: preprodVariables};
  await handleUpdateConfig('pre-prod', 'ios', newPreprodIosConfig);
  await handleUpdateConfig('pre-prod', 'android', newPreprodAndroidConfig);
  const newProdAndroidConfig = {...prodAndroidConfig, environmentVariables: prodVariables};
  const newProdIosConfig = {...prodIosConfig, environmentVariables: prodVariables};
  await handleUpdateConfig('prod', 'ios', newProdIosConfig);
  await handleUpdateConfig('prod', 'android', newProdAndroidConfig)
}

const validateCIParams = ({platform, env}) => {
  if( !PLATFORMS?.includes(platform) && !Array.isArray(platform)) {
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
    const defaultEnv = 'staging';
    const formattedArgs = args.reduce((acc, item) => {
      if(item?.includes('platform')) {
        return Object.assign(acc, {platform: item?.split(':')?.pop()});
      }
      if(item?.includes('env')) {
        return Object.assign(acc, {env: item?.split(':')?.pop()});
      }
      return acc;
    }, {platform: PLATFORMS, env: defaultEnv});
    validateCIParams(formattedArgs);
    return triggerDeployScript({
      isCi: true,
      platformParam: formattedArgs?.platform,
      branchParam: formattedArgs?.env
    });
  }

  return triggerDeployScript({isCi: false});
}

startScript();
