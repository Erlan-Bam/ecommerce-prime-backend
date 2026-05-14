import { extractTechnodeusProductPageAttributes } from './technodeus-product-page';

describe('extractTechnodeusProductPageAttributes', () => {
  it('extracts product characteristics from the Technodeus profile tab table', () => {
    const html = `
      <div class="tab-pane fade" id="profile" role="tabpanel">
        <table border="1">
          <tbody>
            <tr>
              <td>Бренд</td>
              <td>Apple</td>
            </tr>
            <tr>
              <td>Процессор</td>
              <td>A19 Pro</td>
            </tr>
            <tr>
              <td>Разрешение экрана (PPI)</td>
              <td>2868 x 1320 (плотность пикселей - 460 точек на дюйм)</td>
            </tr>
            <tr>
              <td>Время работы аккумулятора</td>
              <td>Воспроизведение аудио: до 85 часов, Воспроизведение видео: до 33 часов,,</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    expect(extractTechnodeusProductPageAttributes(html)).toEqual([
      { name: 'Бренд', value: 'Apple' },
      { name: 'Процессор', value: 'A19 Pro' },
      {
        name: 'Разрешение экрана (PPI)',
        value: '2868 x 1320 (плотность пикселей - 460 точек на дюйм)',
      },
      {
        name: 'Время работы аккумулятора',
        value:
          'Воспроизведение аудио: до 85 часов, Воспроизведение видео: до 33 часов,,',
      },
    ]);
  });

  it('decodes html entities and ignores empty rows', () => {
    const html = `
      <div id="profile">
        <table>
          <tr><td>Raw-формат</td><td>Apple&nbsp;ProRAW</td></tr>
          <tr><td></td><td>Нет названия</td></tr>
          <tr><td>NFC</td><td></td></tr>
        </table>
      </div>
    `;

    expect(extractTechnodeusProductPageAttributes(html)).toEqual([
      { name: 'Raw-формат', value: 'Apple ProRAW' },
    ]);
  });
});
