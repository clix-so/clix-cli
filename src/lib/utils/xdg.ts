import xdgAppPaths from 'xdg-app-paths';

const paths = xdgAppPaths('clix');

export const xdg = {
  config: () => paths.config(), // $XDG_CONFIG_HOME/clix
  state: () => paths.state(), // $XDG_STATE_HOME/clix
  data: () => paths.data(), // $XDG_DATA_HOME/clix
  cache: () => paths.cache(), // $XDG_CACHE_HOME/clix
};
