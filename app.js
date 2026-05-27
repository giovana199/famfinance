
const STORAGE_KEY = "famfinance_v2";

let bills = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

const list = document.getElementById("list");
const totalEl = document.getElementById("total");
const paidEl = document.getElementById("paid");
const pendingEl = document.getElementById("pending");

function formatCurrency(value){
  return value.toLocaleString("pt-BR", {
    style:"currency",
    currency:"BRL"
  });
}

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bills));
}

function render(){
  list.innerHTML = "";

  let total = 0;
  let paid = 0;

  bills.forEach(bill => {
    total += bill.amount;

    if(bill.paid){
      paid += bill.amount;
    }

    const div = document.createElement("div");
    div.className = "bill";

    div.innerHTML = `
      <div class="bill-info">
        <h3>${bill.name}</h3>
        <p>${formatCurrency(bill.amount)}</p>
        <small>${bill.date}</small>
      </div>

      <div class="actions">
        <button class="paid">
          ${bill.paid ? "Pago" : "Pagar"}
        </button>

        <button class="delete">
          Excluir
        </button>
      </div>
    `;

    div.querySelector(".paid").addEventListener("click", () => {
      bill.paid = !bill.paid;
      save();
      render();
    });

    div.querySelector(".delete").addEventListener("click", () => {
      bills = bills.filter(b => b.id !== bill.id);
      save();
      render();
    });

    list.appendChild(div);
  });

  totalEl.textContent = formatCurrency(total);
  paidEl.textContent = formatCurrency(paid);
  pendingEl.textContent = formatCurrency(total - paid);
}

document.getElementById("addBtn").addEventListener("click", () => {
  const name = document.getElementById("name").value;
  const amount = parseFloat(document.getElementById("amount").value);
  const date = document.getElementById("date").value;

  if(!name || !amount || !date){
    alert("Preencha todos os campos.");
    return;
  }

  bills.push({
    id: Date.now(),
    name,
    amount,
    date,
    paid:false
  });

  save();
  render();

  document.getElementById("name").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("date").value = "";
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const data = JSON.stringify(bills, null, 2);

  const blob = new Blob([data], {type:"application/json"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "famfinance-backup.json";
  a.click();
});

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("sw.js");
}

render();
