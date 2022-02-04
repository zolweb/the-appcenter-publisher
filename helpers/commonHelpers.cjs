/* eslint-disable no-console */

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
 * if some attributes are missing, otherwise will return the full config object
 * @param  {object} CONFIG_FILE - .publishrc.js Config file from root App Folder
 * @return  {object} Full config object needed to run the script
 */
const projectConfig = (CONFIG_FILE) => {
  const mandatoryValuesFromConfig = [
    // APP CENTER
    CONFIG_FILE?.appCenter?.userName,
    CONFIG_FILE?.appCenter?.appName?.ios,
    CONFIG_FILE?.appCenter?.appName?.android,
    CONFIG_FILE?.appCenter?.token,
    // GIT
    CONFIG_FILE?.git?.repoURL,
  ];
  const isConfigFileValid = mandatoryValuesFromConfig
    .every((configConstant) => configConstant !== undefined);

  if (!isConfigFileValid) {
    printErrorConsoleMessage('Your config file has errors please check with the documentation');
    process.exit(1);
  }

  return {
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
  };
};

module.exports = {
  printConsoleMessage,
  printErrorConsoleMessage,
  projectConfig,
};
