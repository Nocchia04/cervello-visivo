import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent chiama AppRegistry.registerComponent('main', ...)
// e assicura che funzioni sia in Expo Go che in bare workflow
registerRootComponent(App);
