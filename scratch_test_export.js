const { generateAttendanceRegisterExcel } = require('./src/utils/excel');
const { generateAttendanceRegisterPdf } = require('./src/utils/pdf');
const path = require('path');

const mockData = {
  employees: [
    { id: 1, name: 'Ankur', role: 'USK' },
    { id: 2, name: 'Ankit Maurya', role: 'USK' },
    { id: 3, name: 'Ashish', role: 'SK' }
  ],
  records: [
    { employee_id: 1, date: '2026-05-01', status: 'P' },
    { employee_id: 1, date: '2026-05-02', status: 'P' },
    { employee_id: 1, date: '2026-05-03', status: 'WO' },
    { employee_id: 2, date: '2026-05-01', status: 'A' },
    { employee_id: 2, date: '2026-05-02', status: 'A' },
    { employee_id: 2, date: '2026-05-03', status: 'A' },
    { employee_id: 3, date: '2026-05-01', status: 'H' },
    { employee_id: 3, date: '2026-05-02', status: 'P' },
    { employee_id: 3, date: '2026-05-03', status: 'WO' }
  ]
};

async function test() {
  const month = 5;
  const year = 2026;
  
  try {
    const excelPath = path.join(__dirname, 'test_register.xlsx');
    await generateAttendanceRegisterExcel(mockData, month, year, excelPath);
    console.log('Excel generated:', excelPath);

    const pdfPath = path.join(__dirname, 'test_register.pdf');
    await generateAttendanceRegisterPdf(mockData, month, year, pdfPath);
    console.log('PDF generated:', pdfPath);
  } catch (err) {
    console.error('Error generating:', err);
  }
}

test();
