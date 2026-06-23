import { AppRegistry } from 'react-native'

import App from './App'
import { mobileRuntime } from './src/runtime'

AppRegistry.registerComponent(mobileRuntime.appRegistryName, () => App)
