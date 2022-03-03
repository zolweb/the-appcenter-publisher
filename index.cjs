#!/usr/bin/env node

/* eslint-disable no-console */
// Imports
const { prompt } = require('enquirer');
const appRootPath = require('app-root-path');
const { projectConfig } = require('./helpers/commonHelpers.cjs');
const { manageGitFlow } = require('./helpers/gitHelpers.cjs');
const { triggerAppCenterBuild } = require('./helpers/appCenterHelpers.cjs');

// eslint-disable-next-line import/no-dynamic-require
const CONFIG_FILE = require(`${appRootPath}/.publishrc`);

const promptQuestions = [
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

const deployCLI = async () => {
  try {
    // Get inputs from user
    const { platform, branch } = await prompt(promptQuestions);
    // Get config file from App root directory
    const CONFIG = projectConfig(CONFIG_FILE);
    // Run all the git commands to manage the versionning
    manageGitFlow(branch, CONFIG);
    // Trigger AppCenter build via API call
    triggerAppCenterBuild(platform, branch, CONFIG);
  } catch {
    process.exit(1);
  }

  return null;
};

deployCLI();
