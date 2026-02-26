type Mock = any;

/**
 * Creates a hoisted MockStorage class and accessor for the most recent instance.
 * Use inside vi.hoisted(() => createHoistedMockStorage()) to ensure availability
 * before module mocks are applied.
 */
export function createHoistedMockStorage(vi: any) {
  let instance: any;

  const setInstance = (inst: any) => {
    instance = inst;
  };

  class MockStorage {
    private mockGetToken = vi.fn();
    private mockSetToken = vi.fn();
    private mockDeleteToken = vi.fn();

    constructor() {
      setInstance(this);
    }

    async getToken() {
      return this.mockGetToken();
    }

    async setToken(tokenData: any) {
      return this.mockSetToken(tokenData);
    }

    async deleteToken() {
      return this.mockDeleteToken();
    }

    // Accessors for tests
    _mockGetToken(): Mock {
      return this.mockGetToken;
    }
    _mockSetToken(): Mock {
      return this.mockSetToken;
    }
    _mockDeleteToken(): Mock {
      return this.mockDeleteToken;
    }
  }

  const getInstance = () => instance;

  return { MockStorage, getInstance };
}
