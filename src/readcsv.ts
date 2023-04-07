/**
 * Read CSV, Make Competition and Bar Graph Test
 * @module readcsv
 * @author mokekuma.git@gmail.com
 * @license CC BY 4.0
 */
import Papa from 'papaparse';
import { parse_csvresults, CsvRow, col_names } from './competition';

const formElement = document.querySelector('form');
const csvTableElement = document.getElementById('csv-table');

if (formElement && csvTableElement) {
  formElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    const csvUrlInput = (event.target as HTMLFormElement).elements.namedItem('csv-url') as HTMLInputElement;
    const csvUrl = csvUrlInput.value;
    // console.log(csvUrl);
    if (!csvUrl) {
      return;
    }
    try {
      const response = await fetch(csvUrl);
      const csvText = await response.text()
      const {data: rows, meta: metadata} = Papa.parse<CsvRow<typeof col_names>>(csvText, { header: true, skipEmptyLines: 'greedy' });
      // console.log(rows);
      // console.log(metadata.fields);
      csvTableElement.innerHTML = rows.map((row) => `<tr>${Object.values(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
      console.log(parse_csvresults(rows, metadata.fields, 'matches'));
    } catch (error) {
      console.error(error);
    }
  });
}
