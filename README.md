# zol-appcenter-publish

This script ease the process of publishing React Native builds with Microsoft AppCenter and managing the versionning of your App. Each build to production env will also create a Git Tag and populate a CHANGELOG.md file at the root of your project based on your commits messages.

## How to install

```bash
yarn add -D zol-msappcenter-publish
```

## Getting Started

### App Center configuration

First things first, you will need to have created both of your applications (Android and iOS) on your App Center account. We highly recommand to suffix your application name with the OS like `myawesomeapp-android` or `myawesomeapp-ios`. Then don't forget to link your git repository to it.  
That's it for the App Center part of it.

### Create the config file

In order for the script to run you will need to create a `.publishrc` file at the root of your React-Native project. You can go with this basic mandatory configuration. Or, if you want more depth and customization, see further down for the full possibilities.

```javascript
module.exports = {
  appCenter: {
    userName: 'my_username',
    token: 'my_token',
    appName: {
      ios: 'ios_app_name',
      android: 'android_app_name',
    },
    autoIncrementBuildNumber: true,
    buildAndroidAppBundle: 'prod',
  },
  git: {
    repoURL: 'https://gitlab.com/[my_team]/[my_project]/'
  }
}
```

### Add an entry in your package.json

In your `package.json` add a script entry to ease the process of running the script.

```JSON
"scripts": {
  ...
  "appcenter:publish": "./node_modules/zol-msappcenter-publish/index.cjs"
},
```

### Run the initialisation process

Then before started creating builds like crazy, one last step is to run in your terminal `yarn appcenter:publish --init-config`. Depending on your configuration file it may ask you some questions to complete the process of setting-up your environment.  

## Publishrc configuration options

You can go with the basic configuration or further customize your building process. Read along for an example of a full `.publishrc` file :

```javascript
module.exports = {
    startingVersionNumber: '1.0.0', // This number will be used as versionning starting point
    appCenter: {
        userName: 'my_username',
        token: 'my_token',
        appName: {
            ios: 'appname-ios',
            android: 'appname-android',
        },
        keystorePath: './secrets/keystore.jks', // path to your Android keystore file
        appleCertificatePath: './secrets/certificate20230812.p12', // path to your Apple Certificate
        appleProvisioningProfilePath: {
            staging: './secrets/profiles/appname-adhoc20230812.mobileprovision',
            'pre-prod': './secrets/profiles/appname-adhoc20230812.mobileprovision',
            prod: './secrets/profiles/appname-distribution20230812.mobileprovision'
        },
        autoIncrementBuildNumber: true,
        buildAndroidAppBundle: 'prod', // always - prod - none / if you want App Center to build an App Bundle instead of an .apk
    },
    git: {
        repoURL: 'https://gitlab.com/[my_team]/[my_project]/',
        branches: {
            staging: 'develop', // Your git branch name pointing to your staging env
            'pre-prod': 'pre-prod', // Your git branch name pointing to your pre-production env
            prod: 'main', // Your git branch name pointing to your production env
        },
        commitPrefixes: {
            feature: '[+]', // custom your commit prefix to identify new feature in changelog
            bugFix: '[#]', // custom your commit prefix to identify bug fixes in changelog
        }
    },
    environmentVariables: {
        BUILD_ENV: {
            local: '',
            staging: '',
            'pre-prod': '',
            prod: '',
        },
        API_URL: {
            local: 'localhost/reqres.in/api',
            staging: 'https://reqres.in/api',
            'pre-prod': 'https://reqres.in/api',
            prod: 'https://reqres.in/api',
        },
        TEST: {
            local: 'test.local',
            staging: 'test.staging',
            'pre-prod': 'test.preprod',
            prod: 'test.prod',
        }
    }
}
```

## Available Script arguments

To avoid remembering them all we recommand you to create an entry in your `package.json` for each of them : 
```json
"scripts": {
  ...
  "appcenter:publish": "./node_modules/zol-msappcenter-publish/index.cjs",
  "appcenter:update": "./node_modules/zol-msappcenter-publish/index.cjs --update-config",
  "appcenter:add-var": "./node_modules/zol-msappcenter-publish/index.cjs --add-variable",
  "appcenter:hotfix": "./node_modules/zol-msappcenter-publish/index.cjs --hotfix"
},
```

### `--init-config`

You will need to run the script with this argument only once in your project. As explained, it will trigger a script that will automatically set up your builds environment. In details it will : 
- check if every branch exists on repo and create them if necessary
- create the distribution groups Staging and Pre-prod for your App Center applications
- for each of your App Center applications and your git branches configure properly and link the builds to the right distribution group

### `--update-config`

Use this command to update project configuration and set up your builds environment. In details it will :
- check if every branch exists on repo and create them if necessary
- create the distribution groups Staging and Pre-prod for your App Center applications
- for each of your App Center applications and your git branches configure properly and link the builds to the right distribution group


### `--add-variable`

Run this script when you need to add an environment variable to your project. You need to add all variables and their values per environment in `.publishrc` file.
This script will take this variables and : 
- update `appcenter-post-clone.sh` script 
- add all staging variables in `env.js` file
- update appCenter config for each environment and each platform.


### `--hotfix`
//TODO hotfix mode build the app on the env default branch, without getting changes from other branches
Yet to come but if you encounter a hotfix to make, here is the process to follow (and that the script will follow):

Will check if you have any `hotfix/` branch open, squash the commits and merge the branch into your production one. Then will trigger a build and update your changelog. Finally will checkout on your staging branch and get the hotfix there.

### `---ci [options]`
To run script without prompts.  
You need to specify in options :   
- `platform:[value]` where value must be one of `ios` or `android`. Leave empty for both platforms.
- `env:[value]` where value must be one of `staging`, `pre-prod`, `prod`. Default value is staging.

## Philosophy

We thought a strict but useful flow (to us) to manage our mobile application development flow that will for sure impact how you will be doing things too. The goal is to ease as much as possible the process of creating builds so that our projects managers and clients can QA tests really fast our iterations.  
Then the process will be as follows : 

```
git:staging // Will be your main development branch where you merge all your new features and fixes
↓
appcenter:Staging // Your QA will have access to builds from the develop branch on the Staging group of AppCenter
↓ (QA approved)
git:pre-prod // Pull directly from your work on develop
↓
appcenter:Preprod // Your QA will have access to builds from the pre-prod branch on the Preprod group of AppCenter
↓
git:prod // Pull directly from your work on pre-prod, tag a new version, generate changelog in the repository
↓
appcenter:Stores // When configured, your builds will be published on Google Beta & Testflight to have a last check before going to production
```
Once you will be using the script you won't be able to skip a step because each step get its work from a specific branch and in this strict order. It enforce QA on each different environments possible and once you will be set for production you should be at peace with yourself.

### How the auto-versionning works ?

Thanks to your commit messages pre-fixes the script will be able de auto-generate a changelog and auto-manage your version number. 
```
[major version].[release version].[features and fixes between releases]
       ↓                 ↓                          ↓
manually set in  increment at each     count each feature and fix commit
  .publishrc      new production        since the last production builds
                     build
```
