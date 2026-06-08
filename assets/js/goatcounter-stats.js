(function () {
  const totalVisits = document.getElementById("goatcounter-total-visits");
  if (!totalVisits) {
    return;
  }

  fetch("https://dilgcebuprovince.goatcounter.com/counter/TOTAL.json")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Unable to load GoatCounter statistics.");
      }

      return response.json();
    })
    .then(function (data) {
      totalVisits.textContent = data.count || "0";
    })
    .catch(function () {
      totalVisits.textContent = "Unavailable";
    });
})();
