const { execSync } = require('child_process');
const fs = require('fs');
const { printConsoleMessage } = require('./commonHelpers.cjs');
const { autoIncrementVersionNumber } = require('./nativeRelatedHelpers.cjs');
const { sortOutGitLogToArrays, formatTheChangeLog } = require('./changeLogHelpers.cjs');

const MAX_CHANGELOG_LENGTH = 3000;

/**
 * Fetch the last git tag and return it, if no tag return the starting version number from CONFIG
 * @param  {string} startingVersionNumber
 * @return {string} version number in string
 */
const getLatestTagVersionNumber = (startingVersionNumber) => {
  try {
    return execSync('git describe --tags --abbrev=0').toString('utf-8').trim();
  } catch {
    printConsoleMessage(`No Tag found, default to ${startingVersionNumber}`);
    return startingVersionNumber;
  }
};
/**
 * Return the commit message, if too long return only the changes since last publish commit
 * @param  {String} gitMessage
 * @param  {String} commitSplitMarker
 * @param  {String} newVersionNumber
 * @param  {Object} CONFIG
 * @return {String}
 */
const formatGitMessage = (gitMessage, commitSplitMarker, newVersionNumber, CONFIG) => {
  if (gitMessage > MAX_CHANGELOG_LENGTH) {
    const lastPublishCommitHash = execSync("git log --grep=\"Publish\" --format='%H,'").toString('utf-8').split(',')[0];
    const gitLogOutput = execSync(`git log ${lastPublishCommitHash}..HEAD --format=%B%H${commitSplitMarker}`).toString(
      'utf-8',
    );
    const { features, fixes } = sortOutGitLogToArrays(
      gitLogOutput,
      commitSplitMarker,
      CONFIG,
    );
    return formatTheChangeLog(features, fixes, newVersionNumber);
  }

  return gitMessage;
};

const gitTagBranch = async (versionNumberToTag) => {
  const isVersionAlreadyTagged = execSync(`git tag -l ${versionNumberToTag}'`).toString('utf-8').length > 0;

  if (!isVersionAlreadyTagged) {
    printConsoleMessage(`Tag new version ${versionNumberToTag}`);
    execSync(
      `git tag -a ${versionNumberToTag} -m 'version ${versionNumberToTag}'`,
    );
    execSync(`git push origin ${versionNumberToTag}'`);
  } else {
    printConsoleMessage(`Tag ${versionNumberToTag} already exists, skipping step`);
  }
};

const gitCommitsHistory = (latestTag, commitSplitMarker) => {
  try {
    return execSync(
      `git log ${latestTag}..HEAD --format=%B%H${commitSplitMarker}`,
    ).toString('utf-8');
  } catch {
    printConsoleMessage(
      'No Tag found, getting commits since last publish',
    );
    const lastPublishCommitHash = execSync("git log --grep=\"Publish\" --format='%H,'").toString('utf-8').split(',')[0];
    return execSync(`git log ${lastPublishCommitHash}..HEAD --format=%B%H${commitSplitMarker}`).toString(
      'utf-8',
    );
  }
};

const gitCreateCommitMessage = (
  newChangelog,
  commitSplitMarker,
  newVersionNumber,
  targetedEnv,
  CONFIG,
) => {
  const commitMessageBase = `Publish new ${targetedEnv} version`;
  const isLastCommitAlreadyAPublish = execSync('git log -1 --pretty=%B').toString('utf-8').includes(commitMessageBase);

  if (!isLastCommitAlreadyAPublish) {
    printConsoleMessage(
      `Create publishing commit for version ${newVersionNumber}`,
    );
    execSync('git add .');
    execSync(
      `git commit --allow-empty -m "${commitMessageBase} ${newVersionNumber}" -m "${formatGitMessage(newChangelog, commitSplitMarker, newVersionNumber, CONFIG)}"`,
    );
    execSync('git push');
  } else {
    printConsoleMessage(
      'Publish commit already exists, skipping step',
    );
  }
};

const gitGenerateChangeLog = (shouldGenerateChangeLog, targetedEnv, CONFIG) => {
  execSync(`git checkout ${CONFIG.git.branches.staging} && git pull`);

  const latestTag = getLatestTagVersionNumber(CONFIG.startingVersionNumber);
  const commitSplitMarker = '----DELIMITER----';
  const commitsSinceLastTagOutput = gitCommitsHistory(
    latestTag,
    commitSplitMarker,
  );

  const { features, fixes } = sortOutGitLogToArrays(
    commitsSinceLastTagOutput,
    commitSplitMarker,
    CONFIG,
  );

  const newVersionNumber = autoIncrementVersionNumber(
    latestTag,
    fixes.length,
    features.length,
  );

  const currentChangelog = fs.readFileSync('./CHANGELOG.md', 'utf-8');

  const newChangelog = formatTheChangeLog(features, fixes, newVersionNumber);

  if (shouldGenerateChangeLog) {
    printConsoleMessage(`Generate Change Log for version ${newVersionNumber}`);
    fs.writeFileSync('./CHANGELOG.md', `${newChangelog}${currentChangelog}`);
  }

  gitCreateCommitMessage(
    newChangelog,
    commitSplitMarker,
    newVersionNumber,
    targetedEnv,
    CONFIG,
  );

  return newVersionNumber;
};

const manageGitFlow = (targetedEnv, CONFIG) => {
  const isTargetForProd = targetedEnv === 'prod';
  const newVersionNumber = gitGenerateChangeLog(isTargetForProd, targetedEnv, CONFIG);

  if (isTargetForProd) {
    gitTagBranch(newVersionNumber);
  }

  printConsoleMessage(`Checkout on ${CONFIG.git.branches[targetedEnv]} branch`);
  execSync(`git checkout ${CONFIG.git.branches[targetedEnv]} && git pull`);

  printConsoleMessage(
    'Pulling changes',
  );
  switch (targetedEnv) {
    case CONFIG.git.branches['pre-prod']:
      execSync(`git pull origin ${CONFIG.git.branches.staging} && git push`);
      break;
    case CONFIG.git.branches.prod:
      execSync(`git pull origin ${CONFIG.git.branches['pre-prod']} && git push`);
      break;
    default:
      execSync(`git pull origin ${CONFIG.git.branches.staging} && git push`);
      break;
  }

  printConsoleMessage(`Going back to ${CONFIG.git.branches.staging} branch`);
  execSync(`git checkout ${CONFIG.git.branches.staging}`);
};

module.exports = {
  manageGitFlow,
};
