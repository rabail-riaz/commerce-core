import { renderTemplate } from './campaigns.service';

describe('renderTemplate', () => {
  it('replaces known placeholders and blanks unknown ones', () => {
    expect(renderTemplate('Hello {{ firstName }}, order {{ missing }}', { firstName: 'Ali' })).toBe('Hello Ali, order ');
  });
});
