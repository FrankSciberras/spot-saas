import { registerRootComponent } from 'expo';

// Define the background location task in the global scope so it runs even
// when the app is launched headless by the OS for a location update.
import './lib/locationTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
