import Fuse from 'fuse.js';
import { NetworkRequest } from '../types';

const FUSE_OPTIONS: Fuse.IFuseOptions<NetworkRequest> = {
  keys: [
    { name: 'url', weight: 0.6 },
    { name: 'name', weight: 0.4 }
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2
};

export function createFuseIndex(requests: NetworkRequest[]): Fuse<NetworkRequest> {
  return new Fuse(requests, FUSE_OPTIONS);
}

