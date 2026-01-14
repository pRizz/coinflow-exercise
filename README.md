# Coinflow Software Engineer Take Home

Merchants integrating with Coinflow can opt for one of two different integration methods. They can either utilize 
Coinflow's prebuilt UI's or integrate directly with APIs. The advantage of using the prebuild UI means that a 
merchant gets all of Coinflow's features directly out of the box including: 
1. New Card Checkout
2. Saved Card Checkout
3. Apple Pay
4. Google Pay
5. 3DS
6. Fraud/Chargeback Protection SDK modules

While the Coinflow Prebuilt UI is customizable with colors and fonts, there is a limit. Some merchants want to fully 
control the UI/UX of their checkout flows down to the very small details. This is where Coinflow's API integration
comes into play. There are some considerations however when using APIs, due to [PCI rules](https://www.pcisecuritystandards.org/standards/) customers are not
able to directly pass Coinflow card details (card number and CVV) and instead need to rely on a tokenization service
which securely stores those details so they can be transmitted to Coinflow. 

## Your Task:

Using the existing Battle Brawlers example, remove the `CoinflowPurchase` element in this file `src/CoinflowForm.tsx` 
and replace it with a PCI-compliant implementation which makes API calls directly to Coinflow's APIs. Please implement 
the following functionality: 

1. New Card Checkout
2. Saved Card Checkout

To use Coinflow's PCI-compliant card input elements follow this recipe: https://docs.coinflow.cash/recipes/recipes/pci-compliant-card-tokenization
To call Coinflow's checkout endpoints view the API docs here: https://docs.coinflow.cash/api-reference/api-reference/checkout/get-totals
To view test cards and test various scenarios view here: https://docs.coinflow.cash/guides/checkout/testing/testing-credit-cards

Note: the merchantId you will be using is `swe-challenge`

Hint: Because the `CoinflowPurchase` component utilizes the **exact same** endpoints as you will need to call you can use 
the SDK with the chrome network debugger tab to figure out which API calls you will need to make, and the necessary data
to pass.

You will be graded on the following: 
1. Completeness of the task
2. Error handing and validation
3. Code readability

To be respectful of your time, this task was designed to be completed in under 2 hours. Please do not hesitate to reach
out to our integrations engineer Tasha (tasha@coinflowlabs.app) for questions regarding the integration. Please do be
respectful of her time as well and make sure that your questions are well-formed as this will also factor into the grading.

## Building & Running this repo

1. Install node v20 ([I like to use NVM](https://www.freecodecamp.org/news/node-version-manager-nvm-install-guide/))
2. Change the name of file `.env.example` to `.env`
3. In the root directory run: 
4. `npm install`
5. `npm run build`
6. `npm run dev`

Changes to the UI will hot refresh/update as you make changes
