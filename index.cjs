#!/usr/bin/env node
/* eslint-disable no-console */

// Imports
const { prompt } = require('enquirer');
const appRootPath = require('app-root-path');
const {
  validateProjectConfig, getConfigObject, validateCIParams,
} = require('./helpers/commonHelpers');
const { manageGitFlow, manageGitBranches } = require('./helpers/gitHelpers');
const {
  triggerAppCenterBuild, createAppCenterDistributionGroups, createAppCenterBranchConfig, triggerVariableConfigScript,
} = require('./helpers/appCenterHelpers');
// eslint-disable-next-line import/no-dynamic-require
const CONFIG_FILE = require(`${appRootPath}/.publishrc`);
const { PROMPT_PLATFORMS, PROMPT_ENVIRONMENTS } = require('./helpers/constants');

const [, , ...args] = process.argv;

const SCRIPT_PARAMS = {
  INIT_CONFIG: '--init-config',
  UPDATE_CONFIG: '--update-config',
  CI_MODE: '--ci',
  VAR_CONFIG: '--add-variable',
  HOTFIX_MODE: '--hotfix',
};

const deployPromptQuestions = [
  {
    type: 'multiselect',
    name: 'platform',
    message: 'Select the platform(s) for your build',
    choices: PROMPT_PLATFORMS,
    validate: (choices) => (choices.length === 0 ? 'You need to choose at lease one platform to start building' : true),
  },
  {
    type: 'select',
    name: 'branch',
    message: 'Select the environment you want your app built for',
    choices: PROMPT_ENVIRONMENTS,
  },
];

const triggerDeployScript = async ({
  isCi, platformParam, branchParam, isHotfix,
}) => {
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
    // Run all the git commands to manage the versioning
    await manageGitFlow(branch, CONFIG, isHotfix);
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

async function startScript() {
  // First need to check if project config file is valid
  validateProjectConfig();
  // Check if user specified arguments
  const isInitConfig = args.includes(SCRIPT_PARAMS.INIT_CONFIG);
  const isUpdateConfig = args.includes(SCRIPT_PARAMS.UPDATE_CONFIG);
  const isCI = args.includes(SCRIPT_PARAMS.CI_MODE);
  const isVariableConfig = args.includes(SCRIPT_PARAMS.VAR_CONFIG);
  const isHotfix = args.includes(SCRIPT_PARAMS.HOTFIX_MODE);

  if (isInitConfig || isUpdateConfig) {
    return triggerInitConfigScript();
  }
  if (isVariableConfig && CONFIG_FILE.environmentVariables) {
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
    }, { platform: PROMPT_PLATFORMS, env: defaultEnv });
    validateCIParams(formattedArgs);
    return triggerDeployScript({
      isCi: true,
      platformParam: formattedArgs?.platform,
      branchParam: formattedArgs?.env,
    });
  }

  return triggerDeployScript({ isCi: false, isHotfix });
}

startScript();
