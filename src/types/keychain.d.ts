/**
 * Type declarations for the 'keychain' npm package.
 * @see https://github.com/nicksrandall/keychain
 */

declare module 'keychain' {
  interface KeychainOptions {
    account: string;
    service: string;
    password?: string;
    type?: 'generic' | 'internet';
  }

  type Callback = (error: Error, password?: string) => void;

  function getPassword(options: KeychainOptions, callback: Callback): void;
  function setPassword(options: KeychainOptions, callback: (error: Error) => void): void;
  function deletePassword(options: KeychainOptions, callback: (error: Error) => void): void;

  export = {
    getPassword,
    setPassword,
    deletePassword,
  };
}
