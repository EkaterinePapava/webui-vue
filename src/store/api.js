import Axios from 'axios';
import router from '../router';
import { setupCache, buildWebStorage } from 'axios-cache-interceptor';

//Do not change store import.
//Exact match alias set to support
//dotenv customizations.
import store from '.';

Axios.defaults.headers.common['Accept'] = 'application/json';
Axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

const axiosInstance = Axios.create({
  withCredentials: true,
});

const api = setupCache(axiosInstance, {
  debug: console.log,
  methods: ['get'],
  interpretHeader: false,
  etag: true,
  modifiedSince: false,
  staleIfError: false,
  ttl: 0,
  storage: buildWebStorage(localStorage, 'webui-vue-cache:'),
});

api.interceptors.response.use(undefined, (error) => {
  let response = error.response;

  // TODO: Provide user with a notification and way to keep system active
  if (response.status == 401) {
    if (response.config.url != '/login') {
      window.location = '/login';
      // Commit logout to remove XSRF-TOKEN cookie
      store.commit('authentication/logout');
    }
  }

  // Check if action is unauthorized.
  if (response.status == 403) {
    if (isPasswordExpired(response.data)) {
      router.push('/change-password');
    } else {
      // Toast error message will appear on screen.
      store.commit('global/setUnauthorized');
    }
  }

  return Promise.reject(error);
});

export default {
  get(path, config) {
    return api.get(path, config);
  },
  delete(path, config) {
    return api.delete(path, config);
  },
  post(path, payload, config) {
    return api.post(path, payload, config);
  },
  patch(path, payload, config) {
    return api.patch(path, payload, config);
  },
  put(path, payload, config) {
    return api.put(path, payload, config);
  },
  all(promises) {
    return Axios.all(promises);
  },
  spread(callback) {
    return Axios.spread(callback);
  },
  set_auth_token(token) {
    axiosInstance.defaults.headers.common['X-Auth-Token'] = token;
  },
};

export const getResponseCount = (responses) => {
  let successCount = 0;
  let errorCount = 0;

  responses.forEach((response) => {
    if (response instanceof Error) errorCount++;
    else successCount++;
  });

  return {
    successCount,
    errorCount,
  };
};

export const isPasswordExpired = (data) => {
  return !!findMessageId(data, 'PasswordChangeRequired');
};

/**
 * Returns the first ExtendedInfo.Message to start with the
 * Registry Name (Default: "Base") and end with the given key
 * Ignore versions (.<X>.<Y>) --or-- (.<X>.<Y>.<Z>.),
 *   but adhere to Registry namespace
 * @param {object} data - AxiosResponse.data
 * @param { {MessageKey: string}} key - key into the message registry
 * @param { {MessageRegistryPrefix: string}} [registry=Base] - the name of the
 *        message registry, undefined param defaults to "Base"
 * @returns {ExtendedInfo.Message} ExtendedInfo.Message | undefined
 */
export const findMessageId = (data, key, registry = 'Base') => {
  let extInfoMsgs = data?.['@Message.ExtendedInfo'];

  return (
    extInfoMsgs &&
    extInfoMsgs.find((i) => {
      const words = i.MessageId.split('.');
      return words[words.length - 1] === key && words[0] === registry;
    })
  );
};
