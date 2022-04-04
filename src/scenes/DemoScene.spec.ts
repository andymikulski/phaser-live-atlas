import DemoScene from './DemoScene';

describe('DemoScene', () => {
  it('should not throw an error upon instantiation', () => {
    const attempt = () => new DemoScene({});
    expect(attempt).not.toThrow();
  });
});
