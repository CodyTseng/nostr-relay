import { bytesToHex } from '@noble/curves/abstract/utils';
import { schnorr } from '@noble/curves/secp256k1';
import {
  Event,
  EventKind,
  EventType,
  EventUtils,
  getTimestampInSeconds,
  schnorrSign,
  sha256,
  TagName,
} from '../../src';

describe('EventUtils', () => {
  it('getType', () => {
    expect(EventUtils.getType(EventKind.TEXT_NOTE)).toBe(EventType.REGULAR);

    expect(EventUtils.getType(EventKind.SET_METADATA)).toBe(
      EventType.REPLACEABLE,
    );

    expect(EventUtils.getType(EventKind.EPHEMERAL_FIRST)).toBe(
      EventType.EPHEMERAL,
    );

    expect(EventUtils.getType(EventKind.LONG_FORM_CONTENT)).toBe(
      EventType.PARAMETERIZED_REPLACEABLE,
    );
  });

  it('validate', () => {
    const validEvent = createEvent();

    expect(EventUtils.validate(validEvent)).toBeUndefined();
    expect(EventUtils.validate({ ...validEvent, id: 'invalid' })).toBe(
      'invalid: id is wrong',
    );
    expect(EventUtils.validate({ ...validEvent, sig: 'invalid' })).toBe(
      'invalid: signature is wrong',
    );

    jest
      .spyOn(EventUtils, 'extractExpirationTimestamp')
      .mockReturnValueOnce(getTimestampInSeconds() - 1);
    expect(EventUtils.validate(validEvent)).toBe('reject: event is expired');

    jest.spyOn(EventUtils, 'isDelegationEventValid').mockReturnValueOnce(false);
    expect(EventUtils.validate(validEvent)).toBe(
      'invalid: delegation tag verification failed',
    );
  });

  it('isDelegationEventValid', () => {
    expect(
      EventUtils.isDelegationEventValid(
        createEvent({
          kind: 1,
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>1681822248',
              'f1678c92da0cdfa3a515820e35e295ab4ad95abed08c8925da984219a3ba25e07e0493d5fb6240d83b348a48204e303b9309e43a3bb3c2b14c7827debe3a2cfd',
            ],
          ],
        }),
      ),
    );

    expect(
      EventUtils.validate(
        createEvent({
          kind: 0,
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>1681822248',
              '5f57fd20390510f7efb2d686d37d2733fb86d4dd3c1f901a3de0db0ce9b86fc6ff32a6806a230efab62ffc65315ed30a78d25ef353a21727cbccce1dcaa019b6',
            ],
          ],
        }),
      ),
    ).toBe('invalid: delegation tag verification failed');

    expect(
      EventUtils.validate(
        createEvent({
          created_at: 1681800000,
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>1681822248',
              '5fd4050a572bc9cec54797e170c653831c60478bdccaffa7086a29066a4beb33dbfe4c0add041a4c757c7db9e846029164a257f43a63981af45045b715dac710',
            ],
          ],
        }),
      ),
    ).toBe('invalid: delegation tag verification failed');

    expect(
      EventUtils.validate(
        createEvent({
          created_at: 10000000000,
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>1681822248',
              '7d5cba60ce41ceec2f721770df0f39309bccb5dc4d9cf7779b771cfc66634a313c30b9a3a356b60af5a18ad0b7a24843f4106df39f985c176cec9fad90a6ef91',
            ],
          ],
        }),
      ),
    ).toBe('invalid: delegation tag verification failed');

    expect(
      EventUtils.validate(
        createEvent({
          created_at: 10000000000,
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>1681822248',
            ],
          ],
        }),
      ),
    ).toBe('invalid: delegation tag verification failed');

    expect(
      EventUtils.validate(
        createEvent({
          created_at: 10000000000,
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>1681822248',
              'fake-sig',
            ],
          ],
        }),
      ),
    ).toBe('invalid: delegation tag verification failed');

    expect(
      EventUtils.validate(
        createEvent({
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at',
              '41961e074bafe480da5a364a326872fb072a121ae69e807efafb2a125574af989a77b521e08b75d0e5d8a7ae8c1f5fe9b564ef486e82d9c3bce1241ebb74195b',
            ],
          ],
        }),
      ),
    ).toBe('invalid: delegation tag verification failed');

    expect(
      EventUtils.validate(
        createEvent({
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>NaN',
              'f7c19c73aea476b5f7ec78743f57f96ccac42d0ec9cc67e72c791fbc70a172ff7a6792b6def5aaedb28929fd5e5974a2259b70a8f6122fb95331dffedf54b4ca',
            ],
          ],
          content: 'hello from a delegated key',
        }),
      ),
    ).toBe('invalid: delegation tag verification failed');
  });

  it('isSignedEventValid', () => {
    const challenge = 'APTX-4869';
    const domain = 'localhost';

    expect(
      EventUtils.isSignedEventValid(
        createSignedEvent({
          challenge: 'fake',
        }),
        challenge,
        domain,
      ),
    ).toBe('invalid: the challenge string is wrong');

    expect(
      EventUtils.isSignedEventValid(
        createSignedEvent({
          challenge,
          relay: 'wss://fake',
        }),
        challenge,
        domain,
      ),
    ).toBe('invalid: the relay url is wrong');

    expect(
      EventUtils.isSignedEventValid(
        createSignedEvent({
          challenge,
          relay: 'fake',
        }),
        challenge,
        domain,
      ),
    ).toBe('invalid: the relay url is wrong');

    expect(
      EventUtils.isSignedEventValid(
        createSignedEvent({
          challenge,
          created_at: getTimestampInSeconds() - 20 * 60,
        }),
        challenge,
        domain,
      ),
    ).toBe('invalid: the created_at should be within 10 minutes');

    expect(
      EventUtils.isSignedEventValid(createEvent(), challenge, domain),
    ).toBe('invalid: the kind is not 22242');

    expect(
      EventUtils.isSignedEventValid(
        { ...createEvent(), id: 'fake' },
        challenge,
        domain,
      ),
    ).toBe('invalid: id is wrong');
  });

  it('extractExpirationTimestamp', () => {
    expect(EventUtils.extractExpirationTimestamp(createEvent())).toBeNull();

    expect(
      EventUtils.extractExpirationTimestamp(
        createEvent({
          tags: [[TagName.EXPIRATION, '4869']],
        }),
      ),
    ).toBe(4869);

    expect(
      EventUtils.extractExpirationTimestamp(
        createEvent({
          tags: [[TagName.EXPIRATION, 'fake']],
        }),
      ),
    ).toBeNull();
  });

  it('extractDTagValue', () => {
    expect(EventUtils.extractDTagValue(createEvent())).toBeNull();

    expect(
      EventUtils.extractDTagValue(
        createEvent({
          kind: EventKind.SET_METADATA,
          tags: [[TagName.D, 'test']],
        }),
      ),
    ).toBe('');

    expect(
      EventUtils.extractDTagValue(
        createEvent({ kind: EventKind.LONG_FORM_CONTENT, tags: [[TagName.D]] }),
      ),
    ).toBe('');

    expect(
      EventUtils.extractDTagValue(
        createEvent({
          kind: EventKind.LONG_FORM_CONTENT,
          tags: [
            [TagName.D, 'test'],
            [TagName.D, 'test2'],
          ],
        }),
      ),
    ).toBe('test');
  });

  it('getAuthor', () => {
    expect(EventUtils.getAuthor(createEvent())).toBe(
      'a09659cd9ee89cd3743bc29aa67edf1d7d12fb624699fcd3d6d33eef250b01e7',
    );

    expect(
      EventUtils.getAuthor(
        createEvent({
          kind: 1,
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>1681822248',
              'f1678c92da0cdfa3a515820e35e295ab4ad95abed08c8925da984219a3ba25e07e0493d5fb6240d83b348a48204e303b9309e43a3bb3c2b14c7827debe3a2cfd',
            ],
          ],
        }),
      ),
    ).toBe('a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac');

    expect(
      EventUtils.getAuthor(
        createEvent({
          kind: 1,
          content: 'hello from a delegated key',
          tags: [
            [
              'delegation',
              'a734cca70ca3c08511e3c2d5a80827182e2804401fb28013a8f79da4dd6465ac',
              'kind=1&created_at<9999999999&created_at>1681822248',
              'fake',
            ],
          ],
        }),
      ),
    ).toBe('a09659cd9ee89cd3743bc29aa67edf1d7d12fb624699fcd3d6d33eef250b01e7');
  });

  it('checkPermission', () => {
    expect(
      EventUtils.checkPermission({ kind: EventKind.TEXT_NOTE } as Event),
    ).toBeTruthy();

    expect(
      EventUtils.checkPermission({
        kind: EventKind.ENCRYPTED_DIRECT_MESSAGE,
      } as Event),
    ).toBeFalsy();

    expect(
      EventUtils.checkPermission(
        {
          kind: EventKind.ENCRYPTED_DIRECT_MESSAGE,
          pubkey: 'pubkey',
          tags: [] as string[][],
        } as Event,
        'pubkey',
      ),
    ).toBeTruthy();

    expect(
      EventUtils.checkPermission(
        {
          kind: EventKind.ENCRYPTED_DIRECT_MESSAGE,
          pubkey: 'fake',
          tags: [[TagName.PUBKEY, 'pubkey']],
        } as Event,
        'pubkey',
      ),
    ).toBeTruthy();

    expect(
      EventUtils.checkPermission(
        {
          kind: EventKind.ENCRYPTED_DIRECT_MESSAGE,
          pubkey: 'fake',
          tags: [[TagName.PUBKEY, 'fake']],
        } as Event,
        'pubkey',
      ),
    ).toBeFalsy();

    expect(
      EventUtils.checkPermission(
        {
          kind: EventKind.ENCRYPTED_DIRECT_MESSAGE,
          pubkey: 'fake',
          tags: [] as string[][],
        } as Event,
        'pubkey',
      ),
    ).toBeFalsy();
  });

  it('isMatchingFilter', () => {
    expect(
      EventUtils.isMatchingFilter({ id: 'a' } as Event, { ids: ['a'] }),
    ).toBeTruthy();
    expect(
      EventUtils.isMatchingFilter({ id: 'a' } as Event, { ids: ['b'] }),
    ).toBeFalsy();

    expect(
      EventUtils.isMatchingFilter(
        { pubkey: 'a', tags: [] as string[][] } as Event,
        { authors: ['a'] },
      ),
    ).toBeTruthy();
    expect(
      EventUtils.isMatchingFilter(
        { pubkey: 'a', tags: [] as string[][] } as Event,
        { authors: ['b'] },
      ),
    ).toBeFalsy();

    expect(
      EventUtils.isMatchingFilter({ kind: 0 } as Event, { kinds: [0] }),
    ).toBeTruthy();
    expect(
      EventUtils.isMatchingFilter({ kind: 0 } as Event, { kinds: [1] }),
    ).toBeFalsy();

    expect(
      EventUtils.isMatchingFilter({ created_at: 20 } as Event, {
        since: 10,
      }),
    ).toBeTruthy();
    expect(
      EventUtils.isMatchingFilter({ created_at: 10 } as Event, {
        since: 20,
      }),
    ).toBeFalsy();

    expect(
      EventUtils.isMatchingFilter({ created_at: 10 } as Event, {
        until: 20,
      }),
    ).toBeTruthy();
    expect(
      EventUtils.isMatchingFilter({ created_at: 20 } as Event, {
        until: 10,
      }),
    ).toBeFalsy();
  });
});

function createSignedEvent(
  params: {
    challenge?: string;
    created_at?: number;
    relay?: string;
  } = {},
): Event {
  const {
    created_at,
    challenge = 'challenge',
    relay = 'wss://localhost:3000',
  } = params;

  return createEvent({
    kind: 22242,
    created_at,
    tags: [
      ['relay', relay],
      ['challenge', challenge],
    ],
  });
}

export function createEvent(
  params: {
    kind?: number;
    created_at?: number;
    tags?: string[][];
    content?: string;
    targetPowDifficulty?: number;
    privateKey?: string;
  } = {},
): Event {
  const tags = params.tags ?? [];
  const privateKey =
    params.privateKey ??
    '3689c9acc44041d38a44d0cb777e30f51f295a5e5565b4edb661e8f24eece569';
  const pubkey = bytesToHex(schnorr.getPublicKey(privateKey));

  const baseEvent = {
    pubkey,
    kind: params.kind ?? 1,
    created_at: params.created_at ?? getTimestampInSeconds(),
    tags,
    content: params.content ?? '',
  };

  const id = getEventHash(baseEvent);
  const sig = signEvent(id, privateKey);

  return {
    ...baseEvent,
    id,
    sig,
  };
}

function getEventHash(
  event: Pick<Event, 'pubkey' | 'kind' | 'tags' | 'content' | 'created_at'>,
): string {
  return sha256([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
}

function signEvent(eventId: string, key: string): string {
  return schnorrSign(eventId, key);
}
