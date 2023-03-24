"use strict";
// import Papa from 'papaparse';
const formElement = document.querySelector('form');
const csvTableElement = document.getElementById('csv-table');
if (formElement && csvTableElement) {
    formElement.addEventListener('submit', async (event) => {
        event.preventDefault();
        const csvUrlInput = event.target.elements.namedItem('csv-url');
        const csvUrl = csvUrlInput.value;
        console.log(csvUrl);
        if (!csvUrl) {
            return;
        }
        try {
            const response = await fetch(csvUrl);
            const csvText = await response.text();
            const { data: rows } = Papa.parse(csvText, { header: true });
            console.log(rows);
            csvTableElement.innerHTML = rows.map((row) => `<tr>${Object.values(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
        }
        catch (error) {
            console.error(error);
        }
    });
}
