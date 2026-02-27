import axios from 'axios';

async function probe() {
    const urls = [
        'http://localhost:5173/',
        'http://127.0.0.1:5173/',
        'http://localhost:5173/index.html',
        'http://localhost:5174/',
    ];

    for (const url of urls) {
        try {
            console.log(`Probing ${url}...`);
            const res = await axios.get(url);
            console.log(`SUCCESS [${url}]: Status ${res.status}`);
            console.log(`Content prefix: ${res.data.substring(0, 100)}`);
        } catch (e) {
            console.log(`FAILED [${url}]: ${e.message}`);
            if (e.response) {
                console.log(`Status: ${e.response.status}`);
                console.log(`Data: ${JSON.stringify(e.response.data)}`);
            }
        }
    }
}

probe();
