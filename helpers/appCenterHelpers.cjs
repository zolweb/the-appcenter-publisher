const { execSync } = require('child_process');
const { printConsoleMessage, printErrorConsoleMessage } = require('./commonHelpers.cjs');

/**
 * @param  {String} appName
 * @param  {String} userName
 * @param  {String} gitBranch
 * @return {String} API URL
 */
const getAppCenterPOSTURL = (appName, userName, gitBranch) => `https://appcenter.ms/api/v0.1/apps/${userName}/${appName}/branches/${gitBranch}/builds`;
/**
 * Make an API call on AppCenter to trigger the builds via curl command
 * @param  {Array.<String>} platformList
 * @param  {String} branch
 * @param  {Object} CONFIG
 */
const triggerAppCenterBuild = (platformList, branch, CONFIG) => {
  const cURLConfig = `curl --location --request POST --header 'X-API-Token: ${CONFIG.appCenter.token}' --header 'Content-Length: 0'`;

  try {
    platformList.forEach((platform) => {
      const appCenterCURLPOST = `${cURLConfig} ${getAppCenterPOSTURL(
        CONFIG.appCenter.appName[platform],
        CONFIG.appCenter.userName,
        CONFIG.git.branches[branch],
      )}`;
      printConsoleMessage(`Request new ${platform} build on AppCenter`);
      execSync(appCenterCURLPOST);
    });
  } catch {
    printErrorConsoleMessage('Couldn\'t trigger a build on AppCenter');
  }
};

module.exports = {
  triggerAppCenterBuild,
};
