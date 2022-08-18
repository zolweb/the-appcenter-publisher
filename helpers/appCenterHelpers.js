/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const ora = require('ora');
const {
  postAppCenterTriggerBuild,
  generateAppCenterBuildURL,
  getAppCenterBuildInfo,
  postAppCenterNewDistributionGroup,
} = require('../services/appCenterService');
const { getConfigObject } = require('./commonHelpers');

const APP_CENTER_BUILD_STATUS = {
  NOTSTARTED: 'notStarted',
  PROGRESS: 'inProgress',
  CANCELLING: 'cancelling',
  COMPLETED: 'completed',
};

/**
 * Make an API call on AppCenter to trigger the builds via curl command
 * @param  {Array.<String>} platformList
 * @param  {String} branch
 */
const triggerAppCenterBuild = async (platformList, branch) => {
  const CONFIG = getConfigObject();
  const buildStatusQueries = [];

  for (const platform of platformList) {
    const triggerBuildLoader = ora().start(`\x1b[1mRequesting new ${platform} build on AppCenter\x1b[0m\n`);
    const triggerBuildQueryRes = await postAppCenterTriggerBuild(
      CONFIG.appCenter.appName[platform],
      CONFIG.appCenter.userName,
      CONFIG.git.branches[branch],
    );
    if (triggerBuildQueryRes.status === 200 && triggerBuildQueryRes.data) {
      const buildURL = generateAppCenterBuildURL(
        CONFIG.appCenter.appName[platform],
        CONFIG.appCenter.userName,
        CONFIG.git.branches[branch],
        triggerBuildQueryRes.data.id,
      );
      triggerBuildLoader.succeed(`\x1b[1mThe ${platform} branch is buildind : ${buildURL}\x1b[0m`);
      buildStatusQueries.push(() => getAppCenterBuildInfo(
        CONFIG.appCenter.appName[platform],
        CONFIG.appCenter.userName,
        triggerBuildQueryRes.data.id,
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

const createAppCenterDistributionGroups = async () => {
  const CONFIG = getConfigObject();
  const DISTRIBUTION_GROUPS_NAMES = ['Staging', 'Preprod'];

  for (const applicationPlatform of Object.keys(CONFIG.appCenter.appName)) {
    for (const groupName of DISTRIBUTION_GROUPS_NAMES) {
      // Create console string to avoid too much repetition
      const distributionGroupConsoleString = `AppCenter ${groupName} distribution group for ${CONFIG.appCenter.appName[applicationPlatform]}`;
      // Init Ora loader
      const distributionGroupLoader = ora().start(`\x1b[1mCreating ${distributionGroupConsoleString}\x1b[0m\n`);
      // Trigger API Call
      try {
        const distributionGroupQueryRes = await postAppCenterNewDistributionGroup(
          CONFIG.appCenter.appName[applicationPlatform],
          CONFIG.appCenter.userName,
          {
            is_public: true,
            name: groupName,
          },
        );

        if ([200, 201].includes(distributionGroupQueryRes.status)) {
          distributionGroupLoader.succeed(`\x1b[1m${distributionGroupConsoleString} created with success !\x1b[0m`);
        }
      } catch (error) {
        if (error.response.status === 409) {
          distributionGroupLoader.succeed(`\x1b[1m${distributionGroupConsoleString} already exists, skipping\x1b[0m`);
        } else {
          distributionGroupLoader.fail(`Could not create ${distributionGroupConsoleString}\n`);
          // eslint-disable-next-line no-console
          console.error('ERR ', error.response.status);
        }
      }
    }
  }
};

module.exports = {
  triggerAppCenterBuild,
  createAppCenterDistributionGroups,
};
