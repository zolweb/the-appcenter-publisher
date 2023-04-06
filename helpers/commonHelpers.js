/* eslint-disable no-console */
const appRootPath = require('app-root-path');
// eslint-disable-next-line import/no-dynamic-require
const CONFIG_FILE = require(`${appRootPath}/.publishrc`);
const fs = require('fs');
const { PROMPT_PLATFORMS, PROMPT_ENVIRONMENTS } = require('./constants');

const DEFAULT_CONFIG = {
  startingVersionNumber: '1.0.0',
  git: {
    branches: {
      staging: 'develop',
      'pre-prod': 'pre-prod',
      prod: 'main',
    },
    commitPrefixes: {
      feature: '[+]',
      bugFix: '[#]',
    },
  },
};

/**
 * @param  {string} message - Message you want to print in console output
 */
const printConsoleMessage = (message) => console.log(`\x1b[1m▸ ${message}\x1b[0m`);

/**
 * @param  {string} message - Message you want to print in console output
 */
const printErrorConsoleMessage = (message) => console.error(`\x1b[1;31mX ERROR - ${message}\x1b[0m`);

/**
 * Method to verify the integrity of the .publishrc.js Config file. Will output an error message
 * if some attributes are missing
 * @return  {boolean}
 */
const validateProjectConfig = () => {
  const mandatoryValuesFromConfig = [
    // APP CENTER
    CONFIG_FILE?.appCenter?.userName,
    CONFIG_FILE?.appCenter?.appName?.ios,
    CONFIG_FILE?.appCenter?.appName?.android,
    CONFIG_FILE?.appCenter?.token,
    CONFIG_FILE?.appCenter?.autoIncrementBuildNumber,
    CONFIG_FILE?.appCenter?.buildAndroidAppBundle,
    // GIT
    CONFIG_FILE?.git?.repoURL,
  ];
  const isConfigFileValid = mandatoryValuesFromConfig
    .every((configConstant) => configConstant !== undefined);

  if (!isConfigFileValid) {
    printErrorConsoleMessage('Your config file is incorrect or has missing mandatory values, please check it with the documentation');
    process.exit(1);
  }

  return isConfigFileValid;
};
// TODO: Need to memoize this method
/**
 * Method to get the full config object
 * @return  {object} Full config object needed to run the script
 */
const getConfigObject = () => ({
  startingVersionNumber: CONFIG_FILE.startingVersionNumber
    || DEFAULT_CONFIG.startingVersionNumber,
  appCenter: CONFIG_FILE.appCenter,
  git: {
    repoURL: `${CONFIG_FILE.git.repoURL}commit/`,
    branches: {
      staging: CONFIG_FILE?.git?.branches?.staging || DEFAULT_CONFIG?.git?.branches?.staging,
      'pre-prod': CONFIG_FILE?.git?.branches?.['pre-prod'] || DEFAULT_CONFIG?.git?.branches['pre-prod'],
      prod: CONFIG_FILE?.git?.branches?.prod || DEFAULT_CONFIG?.git?.branches?.prod,
    },
    commitPrefixes: {
      feature: CONFIG_FILE?.git?.commitPrefixes?.feature
        || DEFAULT_CONFIG?.git?.commitPrefixes?.feature,
      bugFix: CONFIG_FILE?.git?.commitPrefixes?.bugFix
        || DEFAULT_CONFIG?.git?.commitPrefixes?.bugFix,
    },
  },
});

/**
 * Write env.js file using local environment variables from config file
 */
const writeEnvJsFile = () => {
  printConsoleMessage('Writing env.js file with local variables');

  const allVariables = CONFIG_FILE.environmentVariables;

  if (allVariables) {
    const localVariables = Object.entries(allVariables)?.map(([key, value]) => ({ [key]: value?.staging }));
    const fileContent = `${localVariables?.map((envVar) => `export const ${Object.keys(envVar)} = '${Object.values(envVar)}';`).join('\n')}\n`;
    fs.writeFileSync('env.js', fileContent);
  } else {
    printConsoleMessage('There is no variable in config file, skipping.');
  }
};

/**
 * Validation ofr params given to CI mode
 * @param platform
 * @param env
 */
const validateCIParams = ({ platform, env }) => {
  if (!PROMPT_PLATFORMS?.includes(platform) && !Array.isArray(platform)) {
    printErrorConsoleMessage(`platform param is incorrect, possible values are : ${PLATFORMS?.join(' or ')}. Leave empty for both`);
    process.exit(1);
  }
  if (env && !PROMPT_ENVIRONMENTS?.includes(env)) {
    printErrorConsoleMessage(`env param is incorrect, possible values are : ${ENVIRONMENTS?.join(' or ')}.`);
    process.exit(1);
  }
};

module.exports = {
  printConsoleMessage,
  printErrorConsoleMessage,
  validateProjectConfig,
  getConfigObject,
  writeEnvJsFile,
  validateCIParams,
};
