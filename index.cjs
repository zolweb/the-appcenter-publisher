#!/usr/bin/env node

/* eslint-disable no-console */
// Imports
const { prompt } = require('enquirer');
const { validateProjectConfig, getConfigObject, printErrorConsoleMessage} = require('./helpers/commonHelpers');
const { manageGitFlow, manageGitBranches } = require('./helpers/gitHelpers');
const { triggerAppCenterBuild, createAppCenterDistributionGroups, updateAppCenterBranchConfig } = require('./helpers/appCenterHelpers');

const [, , ...args] = process.argv;

const SCRIPT_PARAMS = {
  INIT_CONFIG: '--init-config',
  UPDATE_CONFIG: '--update-config',
  CI_MODE: '--ci'
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

  if (isInitConfig) {
    return triggerInitConfigScript();
  }

  if (isUpdateConfig) {
    return triggerUpdateConfigScript();
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
