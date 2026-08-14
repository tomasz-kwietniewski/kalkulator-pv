/**
 * Warstwa rysowania: wykresy Chart.js i diagram przeplywu energii.
 *
 * Wydzielona z ui.js, bo ten plik urosl, a wykresow przybylo. Modul nie liczy niczego
 * sam - dostaje gotowe wyniki z silnika i zamienia je na obrazek.
 *
 * Chart.js jest lokalna kopia (src/chart.umd.min.js) i siedzi w globalnym `Chart`.
 * Zadnych wtyczek z sieci: znacznik punktu zwrotu rysujemy wlasnym pluginem ponizej,
 * bo popularna chartjs-plugin-annotation to kolejny plik do pobrania, a strona ma nie
 * wykonywac po zaladowaniu ani jednego zapytania.
 */
import { kwh, proc, zLatami } from './format.js';

export const KOLORY = {
  zielony: '#1d9e75',
  zielonyC: '#0f6e56',
  zielonyJ: '#7cc9a8',
  bursztyn: '#ba7517',
  koral: '#d85a30',
  niebieski: '#2f6fb0',
  siatka: '#eceee9',
  szary: '#9aa09a',
};

const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

/* --- zarzadzanie instancjami ---------------------------------------------------- */

/**
 * Chart.js nie pozwala utworzyc drugiego wykresu na tym samym canvasie, a przeliczamy
 * przy kazdym ruchu suwaka. Trzymamy wiec instancje po id canvasa: pierwszy raz tworzymy,
 * potem tylko podmieniamy dane. To takze powod, dla ktorego wysokosc kontenera musi byc
 * ustalona w CSS - przy maintainAspectRatio:false canvas bez tego rozpycha rodzica
 * przy kazdym odswiezeniu.
 */
const instancje = new Map();

function rysuj(canvas, konfiguracja) {
  const istniejaca = instancje.get(canvas.id);
  if (istniejaca) {
    istniejaca.data = konfiguracja.data;
    istniejaca.options = konfiguracja.options;
    istniejaca.update();
    return istniejaca;
  }
  const nowa = new Chart(canvas, konfiguracja);
  instancje.set(canvas.id, nowa);
  return nowa;
}

/** Pary [idCanvasa, wykres] - do zamiany na obrazki przy pobieraniu wyniku jako plik. */
export const wszystkieWykresy = () => [...instancje.entries()];

/** Chart.js rysuje po ulozeniu strony; przed drukiem trzeba wymusic przeliczenie. */
export const odswiezWykresy = () => instancje.forEach((w) => w.resize());

/* --- plugin znacznika ------------------------------------------------------------ */

/**
 * Pionowe znaczniki na wykresie plus opcjonalny pas pod zerem.
 *
 * Powstal dlatego, ze sam wykres skumulowanego bilansu okazal sie nieczytelny: dwie
 * krzywe biegna niemal rownolegle i najwazniejsza informacja - kiedy inwestycja wychodzi
 * na zero - byla do odczytania dopiero po przyjrzeniu sie, gdzie przecinaja os. Teraz
 * to przeciecie jest zaznaczone wprost, z podpisem.
 *
 * Opcje przekazujemy przez options.plugins.znacznik:
 *   punkty: [{ x, kolor, etykieta }]
 *   pasPodZerem: bool - tlo pod osia zerowa, czyli "jeszcze nie wrocilo"
 *   liniaZera: bool
 */
export const pluginZnacznika = {
  id: 'znacznik',

  beforeDatasetsDraw(chart, args, opcje) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y || !opcje) return;
    const zero = scales.y.getPixelForValue(0);
    if (opcje.pasPodZerem) {
      const gora = Math.min(Math.max(zero, chartArea.top), chartArea.bottom);
      ctx.save();
      ctx.fillStyle = 'rgba(216,90,48,.055)';
      ctx.fillRect(chartArea.left, gora, chartArea.right - chartArea.left, chartArea.bottom - gora);
      ctx.restore();
    }
    if (opcje.liniaZera && zero >= chartArea.top && zero <= chartArea.bottom) {
      ctx.save();
      ctx.strokeStyle = '#8f958f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, zero);
      ctx.lineTo(chartArea.right, zero);
      ctx.stroke();
      ctx.restore();
    }
  },

  afterDatasetsDraw(chart, args, opcje) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !opcje?.punkty) return;
    const zero = Math.min(Math.max(scales.y.getPixelForValue(0), chartArea.top), chartArea.bottom);

    opcje.punkty.forEach((p, i) => {
      if (p.x == null || !Number.isFinite(p.x)) return;
      const x = scales.x.getPixelForValue(p.x);
      if (x < chartArea.left - 1 || x > chartArea.right + 1) return;
      const dol = opcje.pasPodZerem ? zero : chartArea.bottom;

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = p.kolor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, dol);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = p.kolor;
      ctx.beginPath();
      ctx.arc(x, dol, 4.5, 0, Math.PI * 2);
      ctx.fill();

      if (p.etykieta) {
        ctx.font = `600 12px ${FONT}`;
        const szerokosc = ctx.measureText(p.etykieta).width;
        // Etykieta idzie w prawo od kreski, chyba ze nie ma tam miejsca.
        let lewo = x + 9;
        if (lewo + szerokosc + 6 > chartArea.right) lewo = x - szerokosc - 9;
        const gora = chartArea.top + 6 + i * 21;
        ctx.fillStyle = 'rgba(255,255,255,.88)';
        ctx.fillRect(lewo - 4, gora, szerokosc + 8, 17);
        ctx.fillStyle = p.kolor;
        ctx.textBaseline = 'top';
        ctx.fillText(p.etykieta, lewo, gora + 2);
      }
      ctx.restore();
    });
  },
};

const WSPOLNE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } } },
};

/* --- wykresy --------------------------------------------------------------------- */

const MIESIACE = ['sie', 'wrz', 'paź', 'lis', 'gru', 'sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip'];

export function rysujMiesiace(canvas, miesiace) {
  rysuj(canvas, {
    type: 'bar',
    data: {
      labels: MIESIACE,
      datasets: [
        { label: 'produkcja PV', data: miesiace.map((m) => Math.round(m.produkcja)), backgroundColor: KOLORY.zielony },
        { label: 'zużycie', data: miesiace.map((m) => Math.round(m.zuzycie)), backgroundColor: KOLORY.koral },
        { label: 'pobór z sieci', data: miesiace.map((m) => Math.round(m.imp)), backgroundColor: KOLORY.bursztyn },
        { label: 'oddane do sieci', data: miesiace.map((m) => Math.round(m.eksport)), backgroundColor: KOLORY.niebieski },
      ],
    },
    options: {
      ...WSPOLNE,
      scales: {
        y: { beginAtZero: true, grid: { color: KOLORY.siatka }, ticks: { callback: (v) => v + ' kWh' } },
        x: { grid: { display: false } },
      },
    },
  });
}

/**
 * Skumulowany bilans w czasie, ze znacznikami punktow zwrotu.
 *
 * Os X jest liczbowa, a nie kategoryjna: punkt zwrotu wypada w ulamku roku (np. 7,4)
 * i przy skali kategoryjnej trzeba by go recznie interpolowac miedzy slupkami.
 */
export function rysujZwrot(canvas, serie, lat = 20) {
  const naPunkty = (przeplyw) => (przeplyw ?? []).map((v, i) => ({ x: i, y: Math.round(v) }));
  rysuj(canvas, {
    type: 'line',
    plugins: [pluginZnacznika],
    data: {
      datasets: serie.map((s) => ({
        label: s.nazwa,
        data: naPunkty(s.przeplyw),
        borderColor: s.kolor,
        backgroundColor: 'transparent',
        borderWidth: s.grubosc ?? 2,
        borderDash: s.kreskowana ? [6, 4] : undefined,
        tension: 0.2,
        pointRadius: 0,
      })),
    },
    options: {
      ...WSPOLNE,
      plugins: {
        ...WSPOLNE.plugins,
        znacznik: {
          pasPodZerem: true,
          liniaZera: true,
          punkty: serie
            .filter((s) => s.rokZwrotu != null)
            .map((s) => ({ x: s.rokZwrotu, kolor: s.kolor, etykieta: `${s.skrot}: ${zLatami(s.rokZwrotu)}` })),
        },
      },
      scales: {
        y: {
          grid: { color: KOLORY.siatka },
          ticks: { callback: (v) => (v / 1000).toFixed(0) + ' tys.' },
        },
        x: {
          type: 'linear',
          min: 0,
          max: lat,
          grid: { display: false },
          ticks: { stepSize: 2 },
          title: { display: true, text: 'lata od instalacji' },
        },
      },
    },
  });
}

/**
 * Krzywa nasycenia magazynu.
 *
 * Pokazuje to, czego zadna oferta nie mowi wprost: kolejne kWh pojemnosci daja coraz
 * mniej, bo magazyn zagospodaruje tylko nadwyzke powstajaca w ciagu doby. Znacznik
 * stoi na wybranej pojemnosci, zeby bylo widac, po ktorej stronie zalamania sie jest.
 */
export function rysujNasycenie(canvas, krzywa, wybrana) {
  const punkt = (klucz) => krzywa.map((p) => ({ x: p.magazynKWh, y: +p[klucz].toFixed(1) }));
  rysuj(canvas, {
    type: 'line',
    plugins: [pluginZnacznika],
    data: {
      datasets: [
        {
          label: 'autokonsumpcja - ile własnego prądu zużywasz',
          data: punkt('autokonsumpcja'),
          borderColor: KOLORY.zielony,
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2.5,
        },
        {
          label: 'samowystarczalność - ile prądu domu pochodzi z PV',
          data: punkt('samowystarczalnosc'),
          borderColor: KOLORY.niebieski,
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      ...WSPOLNE,
      plugins: {
        ...WSPOLNE.plugins,
        tooltip: { callbacks: { label: (c) => `${c.dataset.label.split(' - ')[0]}: ${proc(c.parsed.y, 1)}` } },
        znacznik: {
          punkty: wybrana > 0
            ? [{ x: wybrana, kolor: KOLORY.koral, etykieta: `Twój wybór: ${wybrana} kWh` }]
            : [],
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: KOLORY.siatka },
          ticks: { callback: (v) => v + '%' },
        },
        x: {
          type: 'linear',
          min: 0,
          grid: { display: false },
          ticks: { stepSize: 5, callback: (v) => v + ' kWh' },
          title: { display: true, text: 'pojemność magazynu' },
        },
      },
    },
  });
}

/* --- diagram przeplywu energii ---------------------------------------------------- */

/**
 * Dokad idzie prad z paneli i skad dom bierze prad - dwa paski udzialow.
 *
 * Pomysl podpatrzony w kalkulatorze niezaleznosci Volkera Quaschninga (HTW Berlin),
 * ktory pokazuje przeplywy zamiast samych procentow. Roznica jest taka, ze tam diagram
 * stoi sam, a tu pokazujemy dwie wersje obok siebie - bez magazynu i z magazynem -
 * bo pytanie brzmi nie "ile mam autokonsumpcji", tylko "co mi da dolozenie magazynu".
 *
 * Rysowane paskami HTML, a nie wykresem: paski skaluja sie same na telefonie
 * i poprawnie wychodza na wydruku, a Chart.js do tego nie jest potrzebny.
 */
function pasek(tytul, calosc, segmenty) {
  const suma = segmenty.reduce((s, x) => s + Math.max(0, x.kWh), 0) || 1;
  const kawalki = segmenty.map((s) => {
    const udzial = (100 * Math.max(0, s.kWh)) / suma;
    // Podpis mieszczimy w segmencie dopiero od 9% szerokosci - nizej nachodzi na sasiada.
    const wewnatrz = udzial >= 9 ? `${Math.round(udzial)}%` : '';
    return `<div class="seg" style="width:${udzial}%;background:${s.kolor}" title="${s.opis}: ${kwh(s.kWh)}">${wewnatrz}</div>`;
  }).join('');
  const legenda = segmenty.map((s) => `<span class="lg"><i style="background:${s.kolor}"></i>`
    + `${s.opis} <b>${kwh(s.kWh)}</b></span>`).join('');
  return `<div class="przeplyw">
    <div class="ptyt">${tytul} <span class="pcal">${kwh(calosc)}</span></div>
    <div class="pasekstos">${kawalki}</div>
    <div class="plegenda">${legenda}</div>
  </div>`;
}

/**
 * @param {object} w wynik symulacji z engine.js
 * @returns {string} HTML dwoch paskow: rozejscie produkcji i pochodzenie pradu w domu
 */
export function diagramPrzeplywu(w) {
  // Bilans produkcji domyka sie dokladnie: co nie poszlo wprost do domu i nie wyszlo
  // do sieci, trafilo do magazynu (jeszcze przed stratami ladowania).
  const doMagazynuZPv = Math.max(0, w.produkcja - w.wprostDoDomu - w.eksportKWh);
  // Pochodzenie pradu zuzytego przez dom. Import obejmuje tez pobor wlasny ukladu
  // i energie kupiona do magazynu, wiec do domu wprost trafia tylko reszta.
  const zSieciWprost = Math.max(0, w.zuzycie - w.wprostDoDomu - w.zMagazynu);

  return pasek('Co się dzieje z prądem z paneli', w.produkcja, [
    { opis: 'wprost do domu', kWh: w.wprostDoDomu, kolor: KOLORY.zielony },
    { opis: 'do magazynu', kWh: doMagazynuZPv, kolor: KOLORY.zielonyJ },
    { opis: 'oddane do sieci', kWh: w.eksportKWh, kolor: KOLORY.niebieski },
  ]) + pasek('Skąd dom bierze prąd', w.zuzycie, [
    { opis: 'wprost z paneli', kWh: w.wprostDoDomu, kolor: KOLORY.zielony },
    { opis: 'z magazynu', kWh: w.zMagazynu, kolor: KOLORY.zielonyJ },
    { opis: 'kupione z sieci', kWh: zSieciWprost, kolor: KOLORY.bursztyn },
  ]);
}

/** Kolumna diagramu z naglowkiem - do zestawienia dwoch wariantow obok siebie. */
export function kolumnaPrzeplywu(naglowek, podpis, w) {
  return `<div class="pkol"><h4>${naglowek}</h4><p class="ppod">${podpis}</p>${diagramPrzeplywu(w)}</div>`;
}
