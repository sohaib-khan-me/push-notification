/**
 * @format
 */
import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

// Must be registered outside any component. Notification messages are shown by
// Android itself in the background, so there is nothing to display here.
setBackgroundMessageHandler(getMessaging(), async () => {});
notifee.onBackgroundEvent(async () => {});

AppRegistry.registerComponent(appName, () => App);
