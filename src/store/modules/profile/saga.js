import {all, takeLatest, call, put, select} from 'redux-saga/effects';
import {showMessage} from 'react-native-flash-message';
import {Keyboard} from 'react-native';
import OneSignal from 'react-native-onesignal';

import {api, suap_api} from '../../../services/api';

import {
  loginFailed,
  loginSuccess,
  updateUserSuccess,
  updateUserFailed,
  logout,
  resetLoading,
} from './actions';

export function* login({payload}) {
  try {
    const {username, password} = payload;

    const suap_response = yield call(suap_api.post, '/autenticacao/token/', {
      username,
      password,
    });

    const {token} = suap_response.data;

    const response = yield call(api.post, '/users', {
      token,
    });

    const user = response.data;

    if (user.campus !== 'PAR' || user.tipo_vinculo !== 'Aluno') {
      showMessage({
        type: 'danger',
        message:
          'Por enquanto o Monitory só está disponivel para alunos do IFRN Parnamirim.',
        duration: 3000,
      });
      yield put(loginFailed());
      return;
    }

    suap_api.defaults.headers.authorization = `JWT ${token}`;
    api.defaults.headers.authorization = `JWT ${token}`;

    OneSignal.setExternalUserId(user.matricula);

    OneSignal.sendTags({
      curso: user.curso,
      curso_ano: user.curso_ano,
      curso_turno: user.curso_turno,
    });

    yield put(loginSuccess({token, user}));
  } catch (err) {
    if (err.response) {
      showMessage({type: 'danger', message: err.response.data.detail});
    } else {
      showMessage({
        type: 'danger',
        message: 'Erro de conexão',
        description: 'Verifique sua conexão com a internet.',
      });
    }

    yield put(loginFailed());
  }
}

export function* updateUser({payload}) {
  try {
    const {
      id,
      email,
      selectedClassYear: curso_ano,
      selectedClassTurn: curso_turno,
    } = payload;

    const data = {
      id,
      curso_ano,
      curso_turno,
    };

    if (email && email !== '') {
      data.email = email;
    }

    const response = yield call(api.put, '/users', data);

    const user = response.data;

    OneSignal.setExternalUserId(user.matricula);

    OneSignal.sendTags({
      curso: user.curso,
      curso_ano: user.curso_ano,
      curso_turno: user.curso_turno,
    });

    showMessage({type: 'success', message: 'Dados atualizados com sucesso.'});

    yield put(updateUserSuccess(user));
  } catch (err) {
    if (err.response) {
      showMessage({type: 'danger', message: err.response.data.detail});
    } else {
      showMessage({
        type: 'danger',
        message: 'Erro de conexão',
        description: 'Verifique sua conexão com a internet.',
      });
    }

    yield put(updateUserFailed());
  }
  Keyboard.dismiss();
}

export function* refresh() {
  yield put(resetLoading());

  api.defaults.timeout = 15000;
  suap_api.defaults.timeout = 15000;

  const state = yield select();
  const {token, user} = state.profile;

  if (!token) return;

  try {
    const response = yield call(suap_api.post, '/autenticacao/token/refresh/', {
      token,
    });

    if (!(response.status === 200)) {
      yield put(logout());
      showMessage({
        type: 'info',
        message: 'Sua sessão do SUAP expirou. Por favor, faça login novamente.',
      });
    }

    suap_api.defaults.headers.authorization = `JWT ${token}`;
    api.defaults.headers.authorization = `JWT ${token}`;

    OneSignal.setExternalUserId(user.matricula);

    OneSignal.sendTags({
      curso: user.curso,
      curso_ano: user.curso_ano,
      curso_turno: user.curso_turno,
    });
  } catch (err) {
    if (err.response) {
      yield put(logout());
    } else {
      showMessage({
        type: 'danger',
        message: 'Erro de conexão',
        description: 'Verifique sua conexão com a internet.',
      });
    }
  }
}

export function logOut() {
  OneSignal.removeExternalUserId();
}

export default all([
  takeLatest('@profile/LOGIN_REQUEST', login),
  takeLatest('@profile/UPDATE_USER_REQUEST', updateUser),
  takeLatest('@profile/LOGOUT', logOut),
  takeLatest('persist/REHYDRATE', refresh),
]);
