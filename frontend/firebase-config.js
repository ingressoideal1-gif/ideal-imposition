// Configuração do Firebase para a aplicação online
// Substitua as chaves abaixo com as credenciais do seu projeto Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyDzrwfIyhaxVJlWCeXtoDAqTTssPVJMcgM",
    authDomain: "ideal-arte-e64f6.firebaseapp.com",
    projectId: "ideal-arte-e64f6",
    storageBucket: "ideal-arte-e64f6.firebasestorage.app",
    messagingSenderId: "1076847146913",
    appId: "1:1076847146913:web:dd975610be14c05b02fde0"
};

// URL base do backend FastAPI.
// Deixe vazio ("") para desenvolvimento local (mesmo domínio).
// Altere para a URL de produção quando publicar o backend online (ex: "https://ideal-imposition-api.onrender.com").
const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.protocol !== 'file:'
    ? ""
    : "https://ideal-imposition-api.onrender.com";

let dbFirebase = null;

// Inicializa o Firebase apenas se a configuração for preenchida
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "SUA_API_KEY") {
    try {
        firebase.initializeApp(firebaseConfig);
        dbFirebase = firebase.firestore();
        console.log("Firebase Firestore inicializado com sucesso!");
    } catch (e) {
        console.error("Erro ao inicializar o Firebase:", e);
    }
} else {
    console.log("Firebase não configurado. Usando API local (FastAPI).");
}
