#!/usr/bin/env node

/* eslint-disable no-console */
// Imports
const { prompt } = require('enquirer');
const appRootPath = require('app-root-path');
const { projectConfig } = require('./helpers/commonHelpers.cjs');
const { manageGitFlow } = require('./helpers/gitHelpers.cjs');
const { triggerAppCenterBuild } = require('./helpers/appCenterHelpers.cjs');
const [,, ...args] = process.argv;

// eslint-disable-next-line import/no-dynamic-require
const CONFIG_FILE = require(`${appRootPath}/.publishrc`);
const SCRIPT_PARAMS = {
  INIT_CONFIG: '--init-config',
  UPDATE_CONFIG: '--update-config'
}

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

const triggerDeployScript = (CONFIG) => {
  try {
    // Get inputs from user
    const { platform, branch } = await prompt(deployPromptQuestions);
    // Run all the git commands to manage the versionning
    manageGitFlow(branch, CONFIG);
    // Trigger AppCenter build via API call
    triggerAppCenterBuild(platform, branch, CONFIG);
  } catch {
    process.exit(1);
  }
}

const triggerInitConfigScript = (CONFIG) => {
  // Check if all branches exists on repo otherwise create them
  manageGitBranches(CONFIG)
  // Use Appcenter API to create groups

  // Use AppCenter API to create the config for each git branch
}

const triggerUpdateConfigScript = (CONFIG) => {}

const deployCLI = async () => {
  // Get config file from App root directory and verify it
  const CONFIG = projectConfig(CONFIG_FILE);
  // Check if user specified arguments 
  const isInitConfig = args.includes(SCRIPT_PARAMS.INIT_CONFIG)
  const isUpdateConfig = args.includes(SCRIPT_PARAMS.UPDATE_CONFIG)

  if (isInitConfig) return triggerInitConfigScript(CONFIG)

  if (isUpdateConfig) return triggerUpdateConfigScript(CONFIG)

  return triggerDeployScript(CONFIG)
};

deployCLI();
