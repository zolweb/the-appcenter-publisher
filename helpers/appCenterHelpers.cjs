/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const ora = require('ora');
const axios = require('axios');

const APP_CENTER_HOST = 'https://appcenter.ms';
const APP_CENTER_BUILD_STATUS = {
  NOTSTARTED: 'notStarted',
  PROGRESS: 'inProgress',
  CANCELLING: 'cancelling',
  COMPLETED: 'completed',
};

/**
 * @param  {String} appName
 * @param  {String} userName
 * @param  {String} gitBranch
 * @return {String} API URL
 */
const getAppCenterTriggerBuildPath = (appName, userName, gitBranch) => `/api/v0.1/apps/${userName}/${appName}/branches/${gitBranch}/builds`;

/**
 * @param  {String} appName
 * @param  {String} userName
 * @param  {Number} buildId
 * @return {String} API URL
 */
const getAppCenterBuildInfoPath = (appName, userName, buildId) => `/api/v0.1/apps/${userName}/${appName}/builds/${buildId}`;

/**
 * @param  {String} appName
 * @param  {String} userName
 * @param  {String} gitBranch
 * @param  {Number} buildId
 * @return {String} APP CENTER build URL
 */
const getAppCenterBuildURL = (appName, userName, gitBranch, buildId) => `https://appcenter.ms/users/${userName}/apps/${appName}/build/branches/${gitBranch}/builds/${buildId}`;

/**
 * Make an API call on AppCenter to trigger the builds via curl command
 * @param  {Array.<String>} platformList
 * @param  {String} branch
 * @param  {Object} CONFIG
 */
const triggerAppCenterBuild = async (platformList, branch, CONFIG) => {
  const buildStatusQueries = [];
  const API = axios.create({
    baseURL: APP_CENTER_HOST,
    headers: {
      'X-API-Token': CONFIG.appCenter.token,
    },
  });

  for (const platform of platformList) {
    const triggerBuildLoader = ora().start(`\x1b[1mRequesting new ${platform} build on AppCenter\x1b[0m\n`);
    const triggerBuildQueryRes = await API.post(
      getAppCenterTriggerBuildPath(
        CONFIG.appCenter.appName[platform],
        CONFIG.appCenter.userName,
        CONFIG.git.branches[branch],
      ),
    );
    if (triggerBuildQueryRes.status === 200 && triggerBuildQueryRes.data) {
      const buildURL = getAppCenterBuildURL(
        CONFIG.appCenter.appName[platform],
        CONFIG.appCenter.userName,
        CONFIG.git.branches[branch],
        triggerBuildQueryRes.data.id,
      );
      triggerBuildLoader.succeed(`\x1b[1mThe ${platform} branch is buildind : ${buildURL}\x1b[0m`);
      buildStatusQueries.push(() => API.get(
        getAppCenterBuildInfoPath(
          CONFIG.appCenter.appName[platform],
          CONFIG.appCenter.userName,
          triggerBuildQueryRes.data.id,
        ),
      ));
    } else {
      triggerBuildLoader.fail(`The ${platform} build was not triggered.\n`);
      // eslint-disable-next-line no-console
      console.error('ERR ', triggerBuildQueryRes.status);
    }
  }

  const buildStatusLoader = ora().start(`\x1b[1mAppCenter is building your app...\x1b[0m\n
  ▸ Updating build status in a minute...\n
  You can terminate this process, this will not affect the build process.
  `);
  const queriesInterval = setInterval(async () => {
    const platformBuildStatusString = {
      ios: '',
      android: '',
    };
    const buildStatusRes = await Promise.all(buildStatusQueries.map((query) => query()));
    const areAllBuildCompleted = buildStatusRes
      .every((buildRes) => buildRes.data.status === APP_CENTER_BUILD_STATUS.COMPLETED);
    const areQueriesFailed = buildStatusRes.every((buildRes) => buildRes.status !== 200);

    if (areQueriesFailed) {
      buildStatusLoader.fail('Failed to get build statuses, check progression with AppCenter links above.');
      return clearInterval(queriesInterval);
    }

    if (areAllBuildCompleted) {
      buildStatusLoader.succeed('\x1b[1mAppCenter builds are completed.\x1b[0m');
      return clearInterval(queriesInterval);
    }

    buildStatusRes.forEach((buildRes) => {
      const isiOSBuild = buildRes?.config?.url?.includes(CONFIG.appCenter.appName.ios);
      const isAndroidBuild = buildRes?.config?.url?.includes(CONFIG.appCenter.appName.android);

      if (isiOSBuild) platformBuildStatusString.ios = `▸ Build iOS : ${buildRes?.data?.status}`;
      if (isAndroidBuild) platformBuildStatusString.android = `▸ Build Android : ${buildRes?.data?.status}`;
    });
    buildStatusLoader.text = `\x1b[1mAppCenter is building your app...\x1b[0m\n
      ${platformBuildStatusString.ios || ''}
      ${platformBuildStatusString.android || ''}
      \nYou can terminate this process, this will not affect the build process.
      `;

    return null;
  }, 30000);
};

module.exports = {
  triggerAppCenterBuild,
};
