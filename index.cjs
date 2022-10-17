#!/usr/bin/env node

/* eslint-disable no-console */
// Imports
const { prompt } = require('enquirer');
const { validateProjectConfig, getConfigObject } = require('./helpers/commonHelpers');
const { manageGitFlow, manageGitBranches } = require('./helpers/gitHelpers');
const { triggerAppCenterBuild, createAppCenterDistributionGroups, updateAppCenterBranchConfig } = require('./helpers/appCenterHelpers');

const [, , ...args] = process.argv;

const SCRIPT_PARAMS = {
  INIT_CONFIG: '--init-config',
  UPDATE_CONFIG: '--update-config',
};

const deployPromptQuestions = [
  {
    type: 'multiselect',
    name: 'platform',
    message: 'Select the platform(s) for your build',
    choices: ['ios', 'android'],
    validate: (choices) => (choices.length === 0 ? 'You need to choose at lease one platform to start building' : true),
  },
  {
    type: 'select',
    name: 'branch',
    message: 'Select the environment you want your app built for',
    choices: ['staging', 'pre-prod', 'prod'],
  },
];

const triggerDeployScript = async () => {
  const CONFIG = getConfigObject();
  try {
    // Get inputs from user
    const { platform, branch } = await prompt(deployPromptQuestions);
    // Run all the git commands to manage the versionning
    await manageGitFlow(branch, CONFIG);
    // Trigger AppCenter build via API call
    triggerAppCenterBuild(platform, branch, CONFIG);
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

async function startScript() {
  // First need to check if poject config file is valid
  validateProjectConfig();
  // Check if user specified arguments
  const isInitConfig = args.includes(SCRIPT_PARAMS.INIT_CONFIG);
  const isUpdateConfig = args.includes(SCRIPT_PARAMS.UPDATE_CONFIG);

  if (isInitConfig) return triggerInitConfigScript();

  if (isUpdateConfig) return triggerUpdateConfigScript();

  return triggerDeployScript();
}

startScript();
