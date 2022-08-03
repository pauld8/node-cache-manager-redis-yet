import { describe, expect, it, beforeEach } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import cacheManager from 'cache-manager';
import { redisStore, RedisCache } from '../src';

let redisCache: RedisCache;
let customRedisCache: RedisCache;

const config = {
  url: 'redis://localhost:6379',
  ttl: 0,
};

beforeEach(async () => {
  redisCache = cacheManager.caching({
    store: await redisStore(config),
    ...config,
  }) as RedisCache;

  const conf = {
    ...config,
    isCacheableValue: (val: unknown) => {
      if (val === undefined) {
        // allow undefined
        return true;
      } else if (val === 'FooBarString') {
        // disallow FooBarString
        return false;
      }
      return redisCache.store.isCacheableValue(val);
    },
  };
  customRedisCache = cacheManager.caching({
    store: await redisStore(conf),
    ...conf,
  }) as RedisCache;
});

describe('set', () => {
  it('should store a value without ttl', () =>
    expect(redisCache.set('foo', 'bar')).resolves.toBeUndefined());

  it('should store a value with a specific ttl', () =>
    expect(redisCache.set('foo', 'bar', config.ttl)).resolves.toBeUndefined());

  it('should store a value with a infinite ttl', () =>
    expect(redisCache.set('foo', 'bar', { ttl: 0 })).resolves.toBeUndefined());

  it('should not be able to store a null value (not cacheable)', () =>
    expect(redisCache.set('foo2', null)).rejects.toBeDefined());

  it('should store a value without callback', async () => {
    const value = 'baz';
    await redisCache.set('foo', value);
    await expect(redisCache.get('foo')).resolves.toEqual(value);
  });

  it('should not store an invalid value', () =>
    expect(redisCache.set('foo1', undefined)).rejects.toStrictEqual(
      new Error('"undefined" is not a cacheable value'),
    ));

  it('should store an undefined value if permitted by isCacheableValue', async () => {
    expect(customRedisCache.store.isCacheableValue(undefined)).toBe(true);
    await customRedisCache.set('foo3', undefined);
  });

  it('should not store a value disallowed by isCacheableValue', async () => {
    expect(customRedisCache.store.isCacheableValue('FooBarString')).toBe(false);
    await expect(
      customRedisCache.set('foobar', 'FooBarString'),
    ).rejects.toBeDefined();
  });

  it('should return an error if there is an error acquiring a connection', async () => {
    await redisCache.store.getClient.disconnect();
    await expect(redisCache.set('foo', 'bar')).rejects.toBeDefined();
  });
});

describe('mset', () => {
  it('should store a value without ttl', () =>
    redisCache.store.mset([
      ['foo', 'bar'],
      ['foo2', 'bar2'],
    ]));

  it(
    'should store a value with a specific ttl',
    () =>
      redisCache.store.mset(
        [
          ['foo', 'bar'],
          ['foo2', 'bar2'],
        ],
        60,
      ),
    100000,
  );

  it('should store a value with a infinite ttl', async () => {
    await redisCache.store.mset([
      ['foo', 'bar'],
      ['foo2', 'bar2'],
    ]);
    await expect(redisCache.store.ttl('foo')).resolves.toEqual(-1);
  });

  it('should not be able to store a null value (not cacheable)', () =>
    expect(redisCache.store.mset([['foo2', null]])).rejects.toBeDefined());

  it('should store a value without callback', async () => {
    await redisCache.store.mset([
      ['foo', 'baz'],
      ['foo2', 'baz2'],
    ]);
    await expect(redisCache.store.mget('foo', 'foo2')).resolves.toStrictEqual([
      'baz',
      'baz2',
    ]);
  });

  it('should not store an invalid value', () =>
    expect(redisCache.store.mset([['foo1', undefined]])).rejects.toBeDefined());

  it('should store an undefined value if permitted by isCacheableValue', async () => {
    expect(customRedisCache.store.isCacheableValue(undefined)).toBe(true);
    await customRedisCache.store.mset([
      ['foo3', undefined],
      ['foo4', undefined],
    ]);
    await expect(
      customRedisCache.store.mget('foo3', 'foo4'),
    ).resolves.toStrictEqual(['undefined', 'undefined']);
  });

  it('should not store a value disallowed by isCacheableValue', async () => {
    expect(customRedisCache.store.isCacheableValue('FooBarString')).toBe(false);
    await expect(
      customRedisCache.store.mset([['foobar', 'FooBarString']]),
    ).rejects.toBeDefined();
  });

  it('should return an error if there is an error acquiring a connection', async () => {
    await redisCache.store.getClient.disconnect();
    await expect(redisCache.store.mset([['foo', 'bar']])).rejects.toBeDefined();
  });
});

describe('mget', () => {
  it('should retrieve a value for a given key', async () => {
    const value = 'bar';
    const value2 = 'bar2';
    await redisCache.store.mset([
      ['foo', value],
      ['foo2', value2],
    ]);
    await expect(redisCache.store.mget('foo', 'foo2')).resolves.toStrictEqual([
      value,
      value2,
    ]);
  });
  it('should return null when the key is invalid', () =>
    expect(
      redisCache.store.mget('invalidKey', 'otherInvalidKey'),
    ).resolves.toStrictEqual([null, null]));

  it('should return an error if there is an error acquiring a connection', async () => {
    await redisCache.store.getClient.disconnect();
    await expect(redisCache.store.mget('foo')).rejects.toBeDefined();
  });
});

describe('del', () => {
  it('should delete a value for a given key', async () => {
    await redisCache.set('foo', 'bar');
    await expect(redisCache.del('foo')).resolves.toBeUndefined();
  });

  it('should delete a unlimited number of keys', async () => {
    await redisCache.store.mset([
      ['foo', 'bar'],
      ['foo2', 'bar2'],
    ]);
    await expect(
      redisCache.store.del(['foo', 'foo2']),
    ).resolves.toBeUndefined();
  });

  it('should return an error if there is an error acquiring a connection', async () => {
    await redisCache.store.getClient.disconnect();
    await expect(redisCache.del('foo')).rejects.toBeDefined();
  });
});

describe('reset', () => {
  it('should flush underlying db', () => redisCache.reset());

  it('should return an error if there is an error acquiring a connection', async () => {
    await redisCache.store.getClient.disconnect();
    await expect(redisCache.reset()).rejects.toBeDefined();
  });
});

describe('ttl', () => {
  it('should retrieve ttl for a given key', async () => {
    const ttl = 100;
    await redisCache.set('foo', 'bar', ttl);
    await expect(redisCache.store.ttl('foo')).resolves.toEqual(ttl);

    await redisCache.set('foo', 'bar', 0);
    await expect(redisCache.store.ttl('foo')).resolves.toEqual(-1);
  });

  it('should retrieve ttl for an invalid key', () =>
    expect(redisCache.store.ttl('invalidKey')).resolves.toEqual(-2));

  it('should return an error if there is an error acquiring a connection', async () => {
    await redisCache.store.getClient.disconnect();
    await expect(redisCache.store.ttl('foo')).rejects.toBeDefined();
  });
});

describe('keys', () => {
  it('should return an array of keys for the given pattern', async () => {
    await redisCache.set('foo', 'bar');
    await expect(redisCache.store.keys('f*')).resolves.toStrictEqual(['foo']);
  });

  it('should return an array of all keys if called without a pattern', async () => {
    await redisCache.store.mset([
      ['foo', 'bar'],
      ['foo2', 'bar2'],
      ['foo3', 'bar3'],
    ]);
    await expect(redisCache.store.keys('f*')).resolves.toStrictEqual([
      'foo3',
      'foo2',
      'foo',
    ]);
  });

  it('should return an array of keys without pattern', async () => {
    await redisCache.reset();
    await redisCache.set('foo', 'bar');
    await expect(redisCache.store.keys()).resolves.toStrictEqual(['foo']);
  });

  it('should return an error if there is an error acquiring a connection', async () => {
    await redisCache.store.getClient.disconnect();
    await expect(redisCache.store.keys()).rejects.toBeDefined();
  });
});

// describe('isCacheableValue', () => {
//   it('should return true when the value is not undefined', (done) => {
//     expect(redisCache.store.isCacheableValue(0)).toBe(true);
//     expect(redisCache.store.isCacheableValue(100)).toBe(true);
//     expect(redisCache.store.isCacheableValue('')).toBe(true);
//     expect(redisCache.store.isCacheableValue('test')).toBe(true);
//     done();
//   });
//
//   it('should return false when the value is undefined', (done) => {
//     expect(redisCache.store.isCacheableValue(undefined)).toBe(false);
//     done();
//   });
//
//   it('should return false when the value is null', (done) => {
//     expect(redisCache.store.isCacheableValue(null)).toBe(false);
//     done();
//   });
// });
//
// describe('redis error event', () => {
//   it('should return an error when the redis server is unavailable', (done) => {
//     redisCache.store.getClient.on('error', (err) => {
//       expect(err).not.toEqual(null);
//       done();
//     });
//     redisCache.store.getClient.emit('error', 'Something unexpected');
//   });
// });
//
// describe('overridable isCacheableValue function', () => {
//   let redisCache2;
//
//   beforeEach(() => {
//     redisCache2 = cacheManager.caching({
//       store: redisStore,
//       auth_pass: config.auth_pass,
//       isCacheableValue: () => {
//         return 'I was overridden';
//       }
//     });
//   });
//
//   it('should return its return value instead of the built-in function', (done) => {
//     expect(redisCache2.store.isCacheableValue(0)).toEqual('I was overridden');
//     done();
//   });
// });
//
// describe('defaults are set by redis itself', () => {
//   let redisCache2;
//
//   beforeEach(() => {
//     redisCache2 = cacheManager.caching({
//       store: redisStore,
//       auth_pass: config.auth_pass,
//     });
//   });
//
//   it('should default the host to `127.0.0.1`', () => {
//     expect(redisCache2.store.getClient.connection_options.host).toEqual('127.0.0.1');
//   });
//
//   it('should default the port to 6379', () => {
//     expect(redisCache2.store.getClient.connection_options.port).toEqual(6379);
//   });
// });

describe('wrap function', () => {
  // Simulate retrieving a user from a database
  const getUser = (id: number) => Promise.resolve({ id });

  it('should work', async () => {
    const id = 123;

    await redisCache.wrap('wrap-promise', () => getUser(id));

    // Second call to wrap should retrieve from cache
    await expect(
      redisCache.wrap('wrap-promise', () => getUser(id + 1)),
    ).resolves.toStrictEqual({ id });
  });
});