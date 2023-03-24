#!/usr/bin/env node
/* eslint-disable no-console */

// Imports
const { prompt } = require('enquirer');
const appRootPath = require('app-root-path');
const {
  validateProjectConfig, getConfigObject, printErrorConsoleMessage, writeEnvJsFile,
} = require('./helpers/commonHelpers');
const { manageGitFlow, manageGitBranches } = require('./helpers/gitHelpers');
const {
  triggerAppCenterBuild, createAppCenterDistributionGroups, createAppCenterBranchConfig,
  manageEnvironmentVariablesFromConfig, retrieveEnvConfig, handleUpdateConfig,
} = require('./helpers/appCenterHelpers');
// eslint-disable-next-line import/no-dynamic-require
const CONFIG_FILE = require(`${appRootPath}/.publishrc`);

const [, , ...args] = process.argv;

const SCRIPT_PARAMS = {
  INIT_CONFIG: '--init-config',
  UPDATE_CONFIG: '--update-config',
  CI_MODE: '--ci',
  VAR_CONFIG: '--add-variable',
};

const PLATFORMS = Object.keys(CONFIG_FILE.appCenter.appName);
const ENVIRONMENTS = Object.keys(CONFIG_FILE.git.branches);

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

const triggerDeployScript = async ({ isCi, platformParam, branchParam }) => {
  const CONFIG = getConfigObject();
  let platform = platformParam;
  let branch = branchParam;
  try {
    if (!isCi) {
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

const triggerVariableConfigScript = async () => {
  if (CONFIG_FILE.environmentVariables) {
    // Update post-clone script
    manageEnvironmentVariablesFromConfig();
    // Create env.js with staging values
    writeEnvJsFile();
    // for each env
    ENVIRONMENTS.forEach(async (environment) => {
      const newVariables = Object.entries(CONFIG_FILE.environmentVariables)?.map(
        ([key, value]) => ({ name: key, value: value?.[environment] }),
      );
      // and each OS
      PLATFORMS.forEach(async (platform) => {
        // getAppCenter config
        const appCenterConfig = await retrieveEnvConfig(environment, platform) || [];
        // Update config with new variables
        const newConfig = { ...appCenterConfig, environmentVariables: newVariables };
        await handleUpdateConfig(environment, platform, newConfig);
      });
    });
  } else {
    printErrorConsoleMessage('There is no variable in config file.');
  }
};

const validateCIParams = ({ platform, env }) => {
  if (!PLATFORMS?.includes(platform) && !Array.isArray(platform)) {
    printErrorConsoleMessage(`platform param is incorrect, possible values are : ${PLATFORMS?.join(' or ')}. Leave empty for both`);
    process.exit(1);
  }
  if (env && !ENVIRONMENTS?.includes(env)) {
    printErrorConsoleMessage(`env param is incorrect, possible values are : ${ENVIRONMENTS?.join(' or ')}.`);
    process.exit(1);
  }
};

async function startScript() {
  // First need to check if project config file is valid
  validateProjectConfig();
  // Check if user specified arguments
  const isInitConfig = args.includes(SCRIPT_PARAMS.INIT_CONFIG);
  const isUpdateConfig = args.includes(SCRIPT_PARAMS.UPDATE_CONFIG);
  const isCI = args.includes(SCRIPT_PARAMS.CI_MODE);
  const isVariableConfig = args.includes(SCRIPT_PARAMS.VAR_CONFIG);

  if (isInitConfig || isUpdateConfig) {
    return triggerInitConfigScript();
  }

  if (isVariableConfig) {
    return triggerVariableConfigScript();
  }

  if (isCI) {
    const defaultEnv = 'staging';
    const formattedArgs = args.reduce((acc, item) => {
      if (item?.includes('platform')) {
        return Object.assign(acc, { platform: item?.split(':')?.pop() });
      }
      if (item?.includes('env')) {
        return Object.assign(acc, { env: item?.split(':')?.pop() });
      }
      return acc;
    }, { platform: PLATFORMS, env: defaultEnv });
    validateCIParams(formattedArgs);
    return triggerDeployScript({
      isCi: true,
      platformParam: formattedArgs?.platform,
      branchParam: formattedArgs?.env,
    });
  }

  return triggerDeployScript({ isCi: false });
}

startScript();
