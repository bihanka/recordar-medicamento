import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { programarAvisos } from './avisos';
import { cargar, fechaTexto, guardar, horaTexto, hoy, tomadaHoy, vacio } from './datos';
import { enviarAlReloj, escucharReloj, leerDelReloj, relojDisponible } from './reloj';

export default function App() {
  const [listo, setListo] = useState(false);
  const [estado, setEstado] = useState(vacio());
  const [nombre, setNombre] = useState('');
  const [dosis, setDosis] = useState('');
  const [hora, setHora] = useState(8);
  const [minuto, setMinuto] = useState(0);
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState('');
  const estadoRef = useRef(estado);
  const editandoRef = useRef(null);

  useEffect(() => {
    let cancelar = () => {};
    let activo = true;

    (async () => {
      let actual = await cargar();
      const remoto = await leerDelReloj();
      if (remoto && (remoto.updatedAt || 0) > (actual.updatedAt || 0)) {
        actual = { ...vacio(), ...remoto };
        await guardar(actual);
      } else if ((actual.medicinas || []).length > 0 && actual.updatedAt > ((remoto && remoto.updatedAt) || 0)) {
        await enviarAlReloj(actual);
      }
      if (!activo) return;
      estadoRef.current = actual;
      setEstado(actual);
      setListo(true);
      programarAvisos(actual).catch(() => {});
      cancelar = escucharReloj((remotoEstado) => {
        const local = estadoRef.current;
        if (!remotoEstado || (remotoEstado.updatedAt || 0) <= (local.updatedAt || 0)) return;
        const siguiente = { ...vacio(), ...remotoEstado };
        estadoRef.current = siguiente;
        setEstado(siguiente);
        guardar(siguiente);
        programarAvisos(siguiente).catch(() => {});
      });
    })();

    return () => {
      activo = false;
      cancelar();
    };
  }, []);

  function aplicar(siguiente) {
    const nuevo = { ...siguiente, updatedAt: Date.now() };
    estadoRef.current = nuevo;
    setEstado(nuevo);
    guardar(nuevo);
    enviarAlReloj(nuevo).catch(() => {});
    programarAvisos(nuevo)
      .then((resultado) => {
        if (resultado === 'denied') {
          setError('Activa las notificaciones del teléfono para el recordatorio.');
        }
      })
      .catch(() => {});
  }

  function guardarMedicina() {
    const nombreLimpio = nombre.trim();
    const dosisLimpia = dosis.trim();
    if (nombreLimpio.length < 2 || nombreLimpio.length > 20) {
      setError('El nombre debe tener de 2 a 20 letras.');
      return;
    }
    const soloLetras = nombreLimpio.split('').every((letra) => {
      return letra === ' ' || letra.toLowerCase() !== letra.toUpperCase();
    });
    if (!soloLetras) {
      setError('El nombre solo admite letras.');
      return;
    }
    if (dosisLimpia.length < 1 || dosisLimpia.length > 20) {
      setError('La dosis debe tener de 1 a 20 caracteres.');
      return;
    }
    if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) {
      setError('La hora va de 00 a 23 y el minuto de 00 a 59.');
      return;
    }
    const medicinas = Array.isArray(estadoRef.current.medicinas) ? [...estadoRef.current.medicinas] : [];
    for (const item of medicinas) {
      if (item.id === editandoId) continue;
      if (item.nombre.toLowerCase() === nombreLimpio.toLowerCase()) {
        setError('Ese medicamento ya está registrado.');
        return;
      }
      if (item.hora === hora && item.minuto === minuto) {
        setError('Ya hay un medicamento a las ' + horaTexto(hora, minuto) + '.');
        return;
      }
    }
    if (!editandoId && medicinas.length >= 10) {
      setError('Solo puedes registrar 10 medicamentos.');
      return;
    }
    if (editandoId) {
      for (let i = 0; i < medicinas.length; i++) {
        if (medicinas[i].id === editandoId) {
          medicinas[i] = {
            ...medicinas[i],
            nombre: nombreLimpio,
            dosis: dosisLimpia,
            hora,
            minuto,
            pospuesta: 0,
          };
        }
      }
    } else {
      medicinas.push({
        id: String(Date.now()),
        nombre: nombreLimpio,
        dosis: dosisLimpia,
        hora,
        minuto,
        tomada: '',
        pospuesta: 0,
      });
    }
    aplicar({ ...estadoRef.current, medicinas });
    limpiar();
    setError('');
  }

  function eliminar(med) {
    const medicinas = estadoRef.current.medicinas.filter((item) => item.id !== med.id);
    if (editandoRef.current === med.id) limpiar();
    aplicar({ ...estadoRef.current, medicinas });
    setError('');
  }

  function tomada(med) {
    const medicinas = estadoRef.current.medicinas.map((item) => {
      if (item.id !== med.id) return item;
      return { ...item, tomada: hoy(), pospuesta: 0 };
    });
    const historial = [
      { id: String(Date.now()), nombre: med.nombre, accion: 'Tomada', cuando: Date.now() },
      ...(estadoRef.current.historial || []),
    ].slice(0, 20);
    aplicar({ ...estadoRef.current, medicinas, historial });
  }

  function empezarEdicion(med) {
    editandoRef.current = med.id;
    setEditandoId(med.id);
    setNombre(med.nombre);
    setDosis(med.dosis);
    setHora(med.hora);
    setMinuto(med.minuto);
    setError('');
  }

  function limpiar() {
    editandoRef.current = null;
    setEditandoId(null);
    setNombre('');
    setDosis('');
    setHora(8);
    setMinuto(0);
  }

  const medicinas = Array.isArray(estado.medicinas) ? estado.medicinas : [];
  const pendientes = medicinas
    .filter((med) => !tomadaHoy(med))
    .sort((a, b) => a.hora * 60 + a.minuto - (b.hora * 60 + b.minuto));
  const tomados = medicinas
    .filter((med) => tomadaHoy(med))
    .sort((a, b) => a.hora * 60 + a.minuto - (b.hora * 60 + b.minuto));
  const historial = Array.isArray(estado.historial) ? estado.historial : [];
  const arriba = Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 0;

  function fila(med, esTomada) {
    let detalle = horaTexto(med.hora, med.minuto) + '  ·  ' + med.dosis;
    if (!esTomada && med.pospuesta > Date.now()) detalle = detalle + '  ·  Pospuesto';
    return (
      <View key={med.id} style={styles.fila}>
        <Text style={styles.filaNombre}>{med.nombre}</Text>
        <Text style={styles.filaDetalle}>{detalle}</Text>
        <View style={styles.filaBotones}>
          <Pressable style={styles.botonChico} onPress={() => empezarEdicion(med)}>
            <Text style={styles.botonChicoTexto}>Editar</Text>
          </Pressable>
          <Pressable style={styles.botonChico} onPress={() => eliminar(med)}>
            <Text style={styles.botonChicoTexto}>Eliminar</Text>
          </Pressable>
          {esTomada ? null : (
            <Pressable style={styles.botonChicoFuerte} onPress={() => tomada(med)}>
              <Text style={styles.botonFuerteTexto}>Tomada</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.pagina}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.telefono} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.contenido, { paddingTop: arriba + 18 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.marca}>MediRecuerda</Text>
          <Text style={styles.lema}>Registra el medicamento. El reloj te avisará a la hora.</Text>
          {!listo ? <Text style={styles.aviso}>Cargando...</Text> : null}

          {listo ? (
            <View style={styles.tarjeta}>
              <Text style={styles.titulo}>{editandoId ? 'Editar medicamento' : 'Nuevo medicamento'}</Text>
              <Text style={styles.etiqueta}>Nombre</Text>
              <TextInput
                value={nombre}
                onChangeText={setNombre}
                placeholder="De 2 a 20 letras"
                placeholderTextColor="#8AA0B2"
                maxLength={20}
                style={styles.campo}
              />
              <Text style={styles.etiqueta}>Dosis</Text>
              <TextInput
                value={dosis}
                onChangeText={setDosis}
                placeholder="De 1 a 20 caracteres"
                placeholderTextColor="#8AA0B2"
                maxLength={20}
                style={styles.campo}
              />
              <Text style={styles.etiqueta}>Hora (de 00 a 23)</Text>
              <View style={styles.relojFila}>
                <Pressable
                  style={[styles.horaBoton, hora === 0 ? styles.horaBotonApagado : null]}
                  onPress={() => setHora((valor) => (valor <= 0 ? valor : valor - 1))}
                >
                  <Text style={styles.horaBotonTexto}>−</Text>
                </Pressable>
                <Text style={styles.hora}>{horaTexto(hora, minuto).slice(0, 2)}</Text>
                <Pressable
                  style={[styles.horaBoton, hora === 23 ? styles.horaBotonApagado : null]}
                  onPress={() => setHora((valor) => (valor >= 23 ? valor : valor + 1))}
                >
                  <Text style={styles.horaBotonTexto}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.etiqueta}>Minuto (de 00 a 59)</Text>
              <View style={styles.relojFila}>
                <Pressable
                  style={[styles.horaBoton, minuto === 0 ? styles.horaBotonApagado : null]}
                  onPress={() => setMinuto((valor) => (valor <= 0 ? valor : valor - 1))}
                >
                  <Text style={styles.horaBotonTexto}>−</Text>
                </Pressable>
                <Text style={styles.hora}>{horaTexto(hora, minuto).slice(3)}</Text>
                <Pressable
                  style={[styles.horaBoton, minuto === 59 ? styles.horaBotonApagado : null]}
                  onPress={() => setMinuto((valor) => (valor >= 59 ? valor : valor + 1))}
                >
                  <Text style={styles.horaBotonTexto}>+</Text>
                </Pressable>
              </View>
              <Pressable style={styles.boton} onPress={guardarMedicina}>
                <Text style={styles.botonTexto}>{editandoId ? 'Guardar cambios' : 'Guardar medicamento'}</Text>
              </Pressable>
              {editandoId ? (
                <Pressable
                  onPress={() => {
                    limpiar();
                    setError('');
                  }}
                >
                  <Text style={styles.enlace}>Cancelar</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {listo ? (
            <View style={styles.tarjeta}>
              <Text style={styles.titulo}>Pendientes</Text>
              {pendientes.length === 0 ? (
                <Text style={styles.vacio}>No hay medicamentos pendientes.</Text>
              ) : (
                pendientes.map((med) => fila(med, false))
              )}
            </View>
          ) : null}

          {listo ? (
            <View style={styles.tarjeta}>
              <Text style={styles.titulo}>Tomados hoy</Text>
              {tomados.length === 0 ? (
                <Text style={styles.vacio}>Todavía no marcas dosis de hoy.</Text>
              ) : (
                tomados.map((med) => fila(med, true))
              )}
            </View>
          ) : null}

          {listo ? (
            <View style={styles.tarjeta}>
              <Text style={styles.titulo}>Historial</Text>
              {historial.length === 0 ? (
                <Text style={styles.vacio}>Todavía no hay dosis registradas.</Text>
              ) : (
                historial.map((item) => (
                  <Text key={item.id} style={styles.historial}>
                    {item.accion}  ·  {item.nombre}  ·  {fechaTexto(item.cuando)}
                  </Text>
                ))
              )}
            </View>
          ) : null}

          <Text style={styles.nota}>
            {relojDisponible()
              ? 'Los medicamentos se guardan en el teléfono y se envían al reloj.'
              : 'Los medicamentos se guardan en este teléfono.'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: '#E7F0F8', alignItems: 'center' },
  telefono: { flex: 1, width: '100%', maxWidth: 430, backgroundColor: '#F4F7FB' },
  contenido: { paddingHorizontal: 20, paddingBottom: 36 },
  marca: { color: '#16324F', fontSize: 28, fontWeight: '700' },
  lema: { color: '#5C6E80', fontSize: 14, marginTop: 4, marginBottom: 16 },
  tarjeta: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14 },
  titulo: { color: '#16324F', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  etiqueta: { color: '#16324F', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  campo: {
    backgroundColor: '#F4F7FB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#16324F',
    marginBottom: 12,
  },
  relojFila: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  horaBoton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E7F1FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  horaBotonApagado: { opacity: 0.35 },
  horaBotonTexto: { color: '#1F6FB2', fontSize: 22, fontWeight: '700' },
  hora: { width: 64, textAlign: 'center', fontSize: 28, fontWeight: '700', color: '#16324F' },
  boton: { backgroundColor: '#1F6FB2', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  botonTexto: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  enlace: { textAlign: 'center', color: '#1F6FB2', fontWeight: '700', marginTop: 12 },
  fila: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E6EEF5' },
  filaNombre: { color: '#16324F', fontSize: 16, fontWeight: '700' },
  filaDetalle: { color: '#5C6E80', marginTop: 2 },
  filaBotones: { flexDirection: 'row', marginTop: 8 },
  botonChico: {
    flex: 1,
    backgroundColor: '#E7F1FA',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginRight: 6,
  },
  botonChicoTexto: { color: '#1F6FB2', fontWeight: '700' },
  botonChicoFuerte: {
    flex: 1,
    backgroundColor: '#1F6FB2',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  botonFuerteTexto: { color: '#FFFFFF', fontWeight: '700' },
  vacio: { color: '#5C6E80' },
  historial: { color: '#16324F', paddingVertical: 6 },
  error: { color: '#B42318', textAlign: 'center', marginBottom: 8 },
  nota: { color: '#5C6E80', fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  aviso: { color: '#5C6E80', marginBottom: 12 },
});
