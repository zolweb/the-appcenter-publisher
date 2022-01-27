#!/usr/bin/env node

/* eslint-disable no-console */
// Imports
const { prompt } = require('enquirer');
const { execSync } = require('child_process');
const fs = require('fs');
const projectConfigFile = require('../../.publishrc');

// #################
// Constants
// #################

const STARTING_VERSION_NUMBER = projectConfigFile?.startingVersionNumber || '1.0.0';

const APP_CENTER_USERNAME = projectConfigFile?.appCenter?.userName;
const APP_CENTER_APP_NAMES = projectConfigFile?.appCenter?.appName; // {ios:string, android:string}
const APP_CENTER_API_TOKEN = projectConfigFile?.appCenter?.token;
const APP_CENTER_MAX_RELEASE_MESSAGE_LENGH = 4500;

const GIT_BRANCHES = projectConfigFile?.git?.branches || { staging: 'develop', 'pre-prod': 'pre-prod', prod: 'main' };
const COMMIT_FEATURE_PREFIX = projectConfigFile?.git?.commitPrefixes?.feature || '[+]';
const COMMIT_FIX_PREFIX = projectConfigFile?.git?.commitPrefixes?.bugFix || '[#]';
const GITLAB_REPO_URL = `${projectConfigFile?.git?.repoURL}commit/`;

const IS_LINUX = process.platform === 'linux';

// #################
// Helpers
// #################

const checkConfigFile = () => {
  const minimumAppCenterConfig = [APP_CENTER_USERNAME, APP_CENTER_APP_NAMES, APP_CENTER_API_TOKEN];

  const isGitConfigValid = ['staging', 'pre-prod', 'prod'].every((prop) => Object.prototype.hasOwnProperty.call(GIT_BRANCHES, prop))
    && !GITLAB_REPO_URL.includes('undefined');
  const isAppCenterConfigValid = minimumAppCenterConfig
    .every((configConstant) => configConstant !== undefined);

  return (
    isAppCenterConfigValid
    && isGitConfigValid
  );
};

const printConsoleMessage = (message) => console.log(`\x1b[1m▸ ${message}\x1b[0m`);

const printErrorConsoleMessage = (message) => console.log(`\x1b[1mX ${message}\x1b[0m`);

const getAppCenterPOSTURL = (appName, gitBranch) => `https://appcenter.ms/api/v0.1/apps/${APP_CENTER_USERNAME}/${appName}/branches/${gitBranch}/builds`;

const getAppCurrentVersionNumber = () => execSync('grep "versionName" android/app/build.gradle')
  .toString()
  .split('"')[1];

const updateiOSVersionNumber = () => {
  const currentVersion = getAppCurrentVersionNumber();
  const projectName = execSync('grep "target" ios/Podfile -m 1')
    .toString()
    .split("'")[1];

  execSync(
    `sed -i ${
      IS_LINUX ? "''" : null
    } "${20}s/>.*</>${currentVersion}</" "./ios/${projectName}/Info.plist"`,
  );
};

const updateAndroidVersionNumber = (newVersionNumber) => execSync(
  `sed -i ${
    IS_LINUX ? "''" : null
  } 's/versionName.*/versionName "${newVersionNumber}"/' './android/app/build.gradle'`,
);

const autoIncrementVersionNumber = (
  currentVersionNumber,
  totalFixesNumber,
  totalFeaturesNumber,
) => {
  const [majorNumber, releaseNumber] = currentVersionNumber.split('.');
  const newReleaseNumber = parseInt(releaseNumber, 10) + 1;
  const newFeaturesNumber = totalFixesNumber + totalFeaturesNumber;
  const newVersionNumber = []
    .concat(majorNumber, newReleaseNumber, newFeaturesNumber)
    .join('.');
  printConsoleMessage(
    `Update Android build.gradle file with new version ${newVersionNumber}`,
  );
  updateAndroidVersionNumber(newVersionNumber);
  printConsoleMessage(
    `Update iOS Info.plist file with new version ${newVersionNumber}`,
  );
  updateiOSVersionNumber(newVersionNumber);

  return newVersionNumber;
};

const getLatestTagVersionNumber = () => {
  try {
    return execSync('git describe --tags --abbrev=0').toString('utf-8').trim();
  } catch {
    printConsoleMessage(`No Tag found, default to ${STARTING_VERSION_NUMBER}`);
    return STARTING_VERSION_NUMBER;
  }
};

const formatGitMessage = (gitMessage) => {
  if (gitMessage.length > APP_CENTER_MAX_RELEASE_MESSAGE_LENGH) {
    return `${gitMessage.substring(
      0,
      APP_CENTER_MAX_RELEASE_MESSAGE_LENGH,
    )}\n ... see CHANGELOG.md for full list`;
  }

  return gitMessage;
};

// #################
// Git Flow
// #################

const gitTagBranch = async (versionNumberToTag) => {
  printConsoleMessage(`Tag new version ${versionNumberToTag}`);
  execSync(
    `git tag -a ${versionNumberToTag} -m 'version ${versionNumberToTag}'`,
  );
  execSync(`git push origin ${versionNumberToTag}'`);
};

const gitCommitsHistory = (latestTag, commitSplitMarker) => {
  try {
    return execSync(
      `git log ${latestTag}..HEAD --format=%B%H${commitSplitMarker}`,
    ).toString('utf-8');
  } catch {
    printConsoleMessage(
      'No Tag found, starting commits history from the beginning',
    );
    return execSync(`git log --format=%B%H${commitSplitMarker}`).toString(
      'utf-8',
    );
  }
};

const gitGenerateChangeLog = (shouldGenerateChangeLog, targetedEnv) => {
  execSync(`git checkout ${GIT_BRANCHES.staging}`);
  execSync('git pull');

  const latestTag = getLatestTagVersionNumber();
  const commitSplitMarker = '----DELIMITER----';
  const commitsSinceLastTagOutput = gitCommitsHistory(
    latestTag,
    commitSplitMarker,
  );

  const commitsArray = commitsSinceLastTagOutput
    .split(`${commitSplitMarker}\n`)
    .map((commit) => {
      const [message, sha] = commit.split('\n');

      return { sha, message };
    })
    .filter((commit) => Boolean(commit.sha));

  const { features, fixes } = commitsArray.reduce(
    (acc, commit) => {
      if (commit.message.startsWith(COMMIT_FEATURE_PREFIX)) {
        const changeLogLine = `* ${commit.message.replace(
          COMMIT_FEATURE_PREFIX,
          '',
        )} ([${commit.sha.substring(0, 6)}](${GITLAB_REPO_URL}${
          commit.sha
        }))\n`;
        return { ...acc, features: acc.features.concat([changeLogLine]) };
      }
      if (commit.message.startsWith(COMMIT_FIX_PREFIX)) {
        const changeLogLine = `* ${commit.message.replace(
          COMMIT_FIX_PREFIX,
          '',
        )} ([${commit.sha.substring(0, 6)}](${GITLAB_REPO_URL}${
          commit.sha
        }))\n`;
        return { ...acc, fixes: acc.fixes.concat([changeLogLine]) };
      }

      return acc;
    },
    { features: [], fixes: [] },
  );

  const newVersionNumber = autoIncrementVersionNumber(
    latestTag,
    fixes.length,
    features.length,
  );

  const currentChangelog = fs.readFileSync('./CHANGELOG.md', 'utf-8');
  let newChangelog = `# Version ${newVersionNumber} (${
    new Date().toISOString().split('T')[0]
  })\n\n`;

  if (features.length) {
    newChangelog += '## Features\n';
    features.forEach((feature) => {
      newChangelog += feature;
    });
    newChangelog += '\n';
  }

  if (fixes.length) {
    newChangelog += '## Fixes\n';
    fixes.forEach((chore) => {
      newChangelog += chore;
    });
    newChangelog += '\n';
  }

  if (shouldGenerateChangeLog) {
    printConsoleMessage(`Generate Change Log for version ${newVersionNumber}`);
    fs.writeFileSync('./CHANGELOG.md', `${newChangelog}${currentChangelog}`);
  }

  printConsoleMessage(
    `Create publishing commit for version ${newVersionNumber}`,
  );
  execSync('git add .');
  execSync(
    `git commit --allow-empty -m "Publish new ${targetedEnv} version ${newVersionNumber}" -m "${formatGitMessage(
      newChangelog,
    )}"`,
  );
  execSync('git push');

  return newVersionNumber;
};

const manageGitFlow = (targetedEnv) => {
  const isTargetForProd = targetedEnv === 'prod';
  const newVersionNumber = gitGenerateChangeLog(isTargetForProd, targetedEnv);

  if (isTargetForProd) {
    gitTagBranch(newVersionNumber);
  }

  printConsoleMessage(`Checkout on ${GIT_BRANCHES[targetedEnv]} branch`);
  execSync(`git checkout ${GIT_BRANCHES[targetedEnv]} && git pull`);

  console.log('\x1b[1m', '▸ Pulling changes', '\x1b[0m');
  switch (targetedEnv) {
    case GIT_BRANCHES['pre-prod']:
      execSync(`git pull origin ${GIT_BRANCHES.staging} && git push`);
      break;
    case GIT_BRANCHES.prod:
      execSync(`git pull origin ${GIT_BRANCHES['pre-prod']} && git push`);
      break;
    default:
      execSync(`git pull origin ${GIT_BRANCHES.staging} && git push`);
      break;
  }

  printConsoleMessage(`Going back to ${GIT_BRANCHES.staging} branch`);
  execSync(`git checkout ${GIT_BRANCHES.staging}`);
};

// #################
// App Center
// #################

const triggerAppCenterBuild = (platformList, branch) => {
  const cURLConfig = `curl --location --request POST --header 'X-API-Token: ${APP_CENTER_API_TOKEN}' --header 'Content-Length: 0'`;

  platformList.forEach((platform) => {
    const appCenterCURLPOST = `${cURLConfig} ${getAppCenterPOSTURL(
      APP_CENTER_APP_NAMES[platform],
      GIT_BRANCHES[branch],
    )}`;
    printConsoleMessage(`Request new ${platform} build on AppCenter`);
    execSync(appCenterCURLPOST);
  });
};

// #################
// Main exec
// #################

const promptQuestions = [
  {
    type: 'multiselect',
    name: 'platform',
    message: 'Pour quel(s) OS générer un build ?',
    choices: ['ios', 'android'],
  },
  {
    type: 'select',
    name: 'branch',
    message: 'Pour quel environnement ?',
    choices: ['staging', 'pre-prod', 'prod'],
  },
];

const deployCLI = async () => {
  if (!checkConfigFile()) {
    printErrorConsoleMessage('Your config file has errors please check with the documentation');
    process.exit(1);
  }

  try {
    const { platform, branch } = await prompt(promptQuestions);

    manageGitFlow(branch);
    triggerAppCenterBuild(platform, branch);
  } catch (error) {
    process.exit(1);
  }

  return null;
};

deployCLI();
