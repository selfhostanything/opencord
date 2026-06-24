import { AppRegistry } from 'react-native'
import { registerGlobals } from '@livekit/react-native'

import App from './App'
import { mobileRuntime } from './src/runtime'

registerGlobals()

AppRegistry.registerComponent(mobileRuntime.appRegistryName, () => App)
