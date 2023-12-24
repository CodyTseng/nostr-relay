import { ClientMetadataService } from '../../src/services/client-metadata.service';
import { Client } from '../../../common';

describe('ClientMetadataService', () => {
  let service: ClientMetadataService;
  let mockClient: Client;

  beforeEach(() => {
    service = new ClientMetadataService();
    mockClient = {} as Client;
  });

  it('should connect a client', () => {
    const metadata = service.connect(mockClient);
    expect(metadata).toBeDefined();
    expect(metadata.id).toBeDefined();
    expect(metadata.subscriptions).toBeDefined();
  });

  it('should disconnect a client', () => {
    service.connect(mockClient);
    const result = service.disconnect(mockClient);
    expect(result).toBe(true);

    const metadata = service.getMetadata(mockClient);
    expect(metadata).toBeUndefined();
  });

  it('should get metadata of a client', () => {
    const metadata = service.connect(mockClient);
    const fetchedMetadata = service.getMetadata(mockClient);
    expect(fetchedMetadata).toEqual(metadata);
  });

  it('should get pubkey of a client', () => {
    const metadata = service.connect(mockClient);
    metadata.pubkey = 'pubkey';
    const pubkey = service.getPubkey(mockClient);
    expect(pubkey).toEqual(metadata.pubkey);
  });

  it('should get subscriptions of a client', () => {
    const metadata = service.connect(mockClient);
    const subscriptions = service.getSubscriptions(mockClient);
    expect(subscriptions).toEqual(metadata.subscriptions);
  });

  it('should get id of a client', () => {
    const metadata = service.connect(mockClient);
    const id = service.getId(mockClient);
    expect(id).toEqual(metadata.id);
  });

  it('should execute callback for each client', () => {
    const metadata = service.connect(mockClient);
    const callback = jest.fn();
    service.forEach(callback);
    expect(callback).toHaveBeenCalledWith(metadata, mockClient);
  });
});
