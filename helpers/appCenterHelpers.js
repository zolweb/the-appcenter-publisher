/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const fs = require('fs');
const ora = require('ora');
const { prompt } = require('enquirer');
const appRootPath = require('app-root-path');
// eslint-disable-next-line import/no-dynamic-require
const PACKAGEJSON_FILE = require(`${appRootPath}/package.json`);
const {
  postAppCenterTriggerBuild,
  generateAppCenterBuildURL,
  getAppCenterBuildInfo,
  postAppCenterNewDistributionGroup,
  postAppCenterBranchConfig,
} = require('../services/appCenterService');
const { getConfigObject } = require('./commonHelpers');

const APP_CENTER_BUILD_STATUS = {
  NOTSTARTED: 'notStarted',
  PROGRESS: 'inProgress',
  CANCELLING: 'cancelling',
  COMPLETED: 'completed',
};

const APP_CENTER_BRANCH_CONFIG_TRIGGER = {
  MANUAL: 'manual',
  AUTO: 'continuous',
};

const APP_CENTER_ENV_GROUP_NAMES = {
  staging: 'Staging',
  preprod: 'Preprod',
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

/**
 * Prompt the user to specify Keystore informations
 * @return  {Promise<{keyAlias:String, keyPassword:String, keystorePassword:String}>}
 */
const manageAndroidKeyStore = async () => {
  const keystorePromptQuestions = [
    {
      type: 'password',
      name: 'keyAlias',
      message: 'You defined a path for your Android Keystore, please provide the key alias : ',
    },
    {
      type: 'password',
      name: 'keyPassword',
      message: 'The key password : ',
    },
    {
      type: 'password',
      name: 'keystorePassword',
      message: 'And the keystore password : ',
    },
  ];
  const results = await prompt(keystorePromptQuestions);

  return results;
};

// EXPORTED METHODS

const createAppCenterDistributionGroups = async () => {
  const CONFIG = getConfigObject();
  const DISTRIBUTION_GROUPS_NAMES = [
    APP_CENTER_ENV_GROUP_NAMES.staging,
    APP_CENTER_ENV_GROUP_NAMES.preprod,
  ];

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

const updateAppCenterBranchConfig = async () => {
  const CONFIG = getConfigObject();
  let keystoreSecretInformation = {};
  // CONFIG_FILE?.appCenter?.appleBuildSignin?.staging?.provisioningProfile,
  // CONFIG_FILE?.appCenter?.appleBuildSignin?.staging?.certificate,
  // CONFIG_FILE?.appCenter?.appleBuildSignin?.['pre-prod']?.provisioningProfile,
  // CONFIG_FILE?.appCenter?.appleBuildSignin?.['pre-prod']?.certificate,
  // CONFIG_FILE?.appCenter?.appleBuildSignin?.prod?.provisioningProfile,
  // CONFIG_FILE?.appCenter?.appleBuildSignin?.prod?.certificate,

  if (CONFIG?.appCenter?.keystorePath) {
    keystoreSecretInformation = await manageAndroidKeyStore();
    const keystoreFile = fs.readFileSync(CONFIG?.appCenter?.keystorePath);
    const keystoreEncoded = keystoreFile.toString('base64');
    const keystoreFilename = CONFIG?.appCenter?.keystorePath.split('/').pop();
    keystoreSecretInformation = { ...keystoreSecretInformation, keystoreEncoded, keystoreFilename };
  }

  const appCenterConfigGlobal = {
    badgeIsEnabled: false, // Enable the build status badge
    trigger: APP_CENTER_BRANCH_CONFIG_TRIGGER.MANUAL, // build triggered auto or manual
    environmentVariables: [
      {
        name: 'TEST_CONFIG',
        value: 'http://testconfig',
      },
    ],
    toolsets: {},
    distribution: {
      destinations: [], // Group IDs
      destinationType: 'groups', // change for prod
      isSilent: false,
    },
  };
  const appCenterConfigToolsetJavascript = {
    nodeVersion: '16.x',
    packageJsonPath: 'package.json',
    reactNativeVersion: PACKAGEJSON_FILE.dependencies['react-native'],
    runTests: false,
  };
  const appCenterConfigToolsetPlatforms = {
    android: {
      buildBundle: CONFIG.appCenter.buildAndroidAppBundle,
      buildVariant: 'release',
      gradleWrapperPath: 'android/gradlew',
      module: 'app',
      runLint: false,
      runTests: false,
      ...keystoreSecretInformation,
    },
    ios: {
      buildVariant: 'release',
      module: 'app',
      runLint: false,
      runTests: false,
    },
  };

  for (const applicationPlatform of Object.keys(CONFIG.appCenter.appName)) {
    for (const branchEnvironment of Object.keys(CONFIG.git.branches)) {
      const envLoaderString = `configuration for branch ${CONFIG.git.branches[branchEnvironment]} for ${CONFIG.appCenter.appName[applicationPlatform]}`;
      // Init Ora loader
      const branchConfigLoader = ora().start(`\x1b[1mSending ${envLoaderString}\x1b[0m\n`);
      // Trigger API Call
      try {
        const branchConfigQueryRes = await postAppCenterBranchConfig(
          CONFIG.appCenter.appName[applicationPlatform],
          CONFIG.appCenter.userName,
          CONFIG.git.branches[branchEnvironment],
          {
            ...appCenterConfigGlobal,
            toolsets: {
              javascript: appCenterConfigToolsetJavascript,
              android: appCenterConfigToolsetPlatforms.android,
            },
          },
        );

        if ([200, 201].includes(branchConfigQueryRes.status)) {
          branchConfigLoader.succeed(`\x1b[1m${envLoaderString} created with success !\x1b[0m`);
        }
      } catch (error) {
        branchConfigLoader.fail(`Could not create ${envLoaderString}\n`);
        // eslint-disable-next-line no-console
        console.error('ERR ', error.response.status, error.response.data);
      }
    }
  }

  console.log('PRINT FULL CONFIG : ', {
    ...appCenterConfigGlobal,
    toolsets: {
      javascript: appCenterConfigToolsetJavascript,
      android: appCenterConfigToolsetPlatforms.android,
    },
  });
};

module.exports = {
  triggerAppCenterBuild,
  createAppCenterDistributionGroups,
  updateAppCenterBranchConfig,
};
