import AsyncStorage from '@react-native-async-storage/async-storage';

const LLAVE = 'medirecuerda';

export function vacio() {
  return {
    medicinas: [],
    historial: [],
    updatedAt: 0,
  };
}

export async function cargar() {
  const texto = await AsyncStorage.getItem(LLAVE);
  if (!texto) return vacio();
  try {
    return { ...vacio(), ...JSON.parse(texto) };
  } catch (error) {
    return vacio();
  }
}

export async function guardar(estado) {
  await AsyncStorage.setItem(LLAVE, JSON.stringify(estado));
}

export function hoy() {
  const fecha = new Date();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return fecha.getFullYear() + '-' + mes + '-' + dia;
}

export function tomadaHoy(med) {
  return med.tomada === hoy();
}

export function horaTexto(hora, minuto) {
  return String(hora).padStart(2, '0') + ':' + String(minuto).padStart(2, '0');
}

export function fechaTexto(marca) {
  return new Date(marca).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
