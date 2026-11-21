import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { hoy } from './datos';

const CANAL = 'medicinas';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function pedirPermiso() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Recordatorios de medicamentos',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 500, 200, 500],
    });
  }
  const actual = await Notifications.getPermissionsAsync();
  if (actual.granted) return true;
  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.granted;
}

export async function programarAvisos(estado) {
  if (Platform.OS === 'web') return 'web';
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  const permitido = await pedirPermiso();
  if (!permitido) return 'denied';

  const medicinas = Array.isArray(estado.medicinas) ? estado.medicinas : [];
  const ahora = Date.now();
  for (const med of medicinas) {
    const titulo = 'Es hora de tomar tu medicamento';
    const cuerpo = med.nombre + ' · ' + med.dosis;
    if (med.tomada === hoy()) {
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      manana.setHours(med.hora, med.minuto, 0, 0);
      await Notifications.scheduleNotificationAsync({
        content: { title: titulo, body: cuerpo, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: manana,
          channelId: CANAL,
        },
      });
      continue;
    }
    if (med.pospuesta && med.pospuesta > ahora) {
      await Notifications.scheduleNotificationAsync({
        content: { title: titulo, body: cuerpo, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(med.pospuesta),
          channelId: CANAL,
        },
      });
      continue;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: titulo, body: cuerpo, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: med.hora,
        minute: med.minuto,
        channelId: CANAL,
      },
    });
  }
  return 'ok';
}
