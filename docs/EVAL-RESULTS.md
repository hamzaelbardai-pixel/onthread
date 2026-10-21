# OnThread live evaluation

Date: 2026-10-21 · Claude Code 2.1.299 (Claude Code) · 13/13 scenarios as expected.
Plugin: installed onthread@onthread (local marketplace = this checkout).
Fictional conversations (tests/eval/scenarios.json). The classifier is a simple heuristic; replies are shown in full so you can judge them yourself.

| Scenario | Expected | Result |
|---|---|---|
| B9-coherent | proceed | as expected |
| B10-subtopic | proceed | as expected |
| B11-general-question | proceed | as expected |
| B12-natural-evolution | proceed | as expected |
| B13-confusion | ask | as expected |
| B14-new-subject | ask | as expected |
| B15-ambiguous | proceed | as expected |
| B16-voluntary-switch | proceed | as expected |
| B17-after-exception | proceed | as expected |
| B17b-continue-here-flow | flow | as expected (question recorded: "Intégration Stripe"; accepted after "Oui, continue ici.": "Intégration Stripe") |
| C25-english-confusion | ask | as expected |
| C26-mixed-languages | ask | as expected |
| A-first-message-topic | topic | as expected (recorded topic: "Programme de fidélité à points clients") |

## B9-coherent

```text
Je n'ai rien modifié : le dépôt `shop` est vide. Il ne contient aucun fichier suivi et aucun commit, et je n'y trouve aucune trace de Stripe ni de remboursement. Il n'existe donc pas encore d'intégration à laquelle ajouter les remboursements partiels.

Pour avancer, il me faut l'une de ces deux choses :

1. **Le code existe ailleurs** (autre dossier, branche non récupérée, dépôt distant) : indique-moi le chemin ou la branche, et j'ajouterai les remboursements partiels en suivant ce qui est déjà en place.
2. **On part de zéro** : dis-moi la stack (par exemple Node/Express, Next.js ou Python/FastAPI) et la façon dont les commandes et paiements sont stockés. Je créerai alors un module de remboursement qui :
   - appelle `stripe.refunds.create({ payment_intent, amount })`, avec `amount` en centimes, pour un remboursement partiel ;
   - vérifie que le montant ne dépasse pas ce qui reste remboursable (montant payé moins les remboursements déjà faits) ;
   - utilise une clé d'idempotence pour éviter les doubles remboursements ;
   - traite les webhooks `charge.refunded` et `refund.updated` pour mettre à jour le statut de la commande (`partially_refunded` ou `refunded`).

Dans quel cas es-tu ?
```

## B10-subtopic

```text
Le dépôt `shop` est vide pour l'instant, donc pas de code existant sur lequel s'appuyer. Voici la structure que je recommande. Elle s'adapte à n'importe quel framework.

## 1. Un format de réponse d'erreur unique

Toutes les erreurs doivent avoir la même forme. Je suggère le standard **RFC 9457 (Problem Details)** :

```json
{
  "type": "https://shop.example/errors/out-of-stock",
  "title": "Produit en rupture de stock",
  "status": 409,
  "code": "OUT_OF_STOCK",
  "detail": "Le produit 42 n'a plus que 0 unité disponible.",
  "instance": "/orders",
  "traceId": "a1b2c3d4",
  "errors": [{ "field": "quantity", "message": "doit être ≤ 0" }]
}
```

- **`code`** : un identifiant stable et lisible par une machine. Le front s'en sert, pas du message.
- **`errors[]`** : uniquement pour les erreurs de validation, avec une entrée par champ.
- **`traceId`** : permet de retrouver la requête dans les logs.

## 2. Une hiérarchie d'erreurs métier

```
AppError (status, code, message, details?)
├── ValidationError      → 400
├── UnauthorizedError    → 401
├── ForbiddenError       → 403
├── NotFoundError        → 404
├── ConflictError        → 409  (ex. OUT_OF_STOCK, EMAIL_TAKEN)
├── BusinessRuleError    → 422  (ex. PAYMENT_DECLINED)
└── ExternalServiceError → 502/503 (Stripe, transporteur…)
```

Les services **lèvent** ces erreurs. Ils ne construisent jamais de réponse HTTP eux-mêmes.

## 3. Un seul middleware global pour convertir les erreurs en HTTP

C'est le seul endroit qui transforme un
```

## B11-general-question

```text
Un **CRM** (*Customer Relationship Management*, ou gestion de la relation client) est à la fois une démarche et un outil logiciel. Il sert à centraliser et gérer toutes les interactions d'une entreprise avec ses clients et prospects.

**Ce qu'il contient en général :**
- **Fiches contacts** : coordonnées, entreprise, historique des échanges
- **Historique** : emails, appels, rendez-vous, achats, tickets de support
- **Pipeline commercial** : suivi des opportunités de vente, d'un premier contact jusqu'à la signature
- **Segmentation** : regrouper les clients selon des critères (fidèles, inactifs, gros acheteurs…)
- **Automatisations** : relances, emails marketing, rappels de tâches
- **Reporting** : chiffre d'affaires prévisionnel, taux de conversion, performance des équipes

**À quoi ça sert :**
- Avoir une vue à 360° de chaque client, partagée entre la vente, le marketing et le support
- Ne rien oublier (relances, demandes en cours)
- Personnaliser la relation et fidéliser
- Piloter l'activité commerciale avec des données

**Exemples connus :** Salesforce, HubSpot, Pipedrive, Zoho CRM, Odoo, ou des modules CRM intégrés à Shopify, Brevo, etc.

**Pour un e-commerce**, un CRM sert surtout à exploiter les données clients : historique de commandes, paniers abandonnés, segmentation pour des campagnes ciblées, programmes de fidélité et service après-vente.
```

## B12-natural-evolution

```text
Je n'ai rien pu ajouter : le dépôt `shop` est vide pour l'instant. Il n'y a ni fichiers ni commits, donc pas encore de code Stripe auquel brancher l'envoi.

Pour un email de confirmation après chaque paiement réussi, je propose de passer par le **webhook Stripe** plutôt que par la page de retour du client. Le webhook se déclenche même si le client ferme l'onglet avant la redirection :

1. Endpoint `POST /webhooks/stripe` qui vérifie la signature avec `stripe.webhooks.constructEvent` et le secret `STRIPE_WEBHOOK_SECRET`.
2. Sur `checkout.session.completed` (ou `payment_intent.succeeded` si tu utilises les PaymentIntents directement), on récupère l'email (`customer_details.email`), le montant et les articles.
3. **Idempotence** : on enregistre l'`event.id` traité pour ne pas envoyer deux fois l'email, car Stripe peut renvoyer le même événement.
4. Envoi de l'email via un service transactionnel (Resend, SendGrid, Postmark…), puis réponse `200` rapide à Stripe.

Simple alternative : Stripe peut envoyer lui-même un reçu (Dashboard → Paramètres → Emails clients → « Paiements réussis »). Il n'y a alors aucun code à écrire, mais le design est limité.

Pour l'implémenter, il me faut :
- **Stack** : Node/Express, Next.js, Python, autre ?
- **Service d'email** : tu en as déjà un ou je choisis (je recommande Resend) ?
- **Mode Stripe** : Checkout Sessions ou PaymentIntents / Elements ?

Si le code existe ailleurs, indique-moi le bon répertoire.
```

## B13-confusion

```text
Cette demande ressemble plutôt à ta conversation « Intégration Stripe », qui porte sur les paiements, les webhooks et les remboursements. Ici, on parle de stratégie marketing. Tu veux quand même que je corrige la synchronisation des paiements Stripe ici ?

🧭 OnThread · question : Intégration Stripe
```

## B14-new-subject

```text
Ta demande (un outil de gestion RH) n'a pas grand-chose à voir avec cette conversation, qui porte sur le design du dashboard et des pages produit de la boutique. Je te conseille d'ouvrir une conversation dédiée, et idéalement un projet séparé. On continue ici quand même ?

🧭 OnThread · question : Outil RH
```

## B15-ambiguous

```text
Je n'ai trouvé aucune page des tarifs à modifier : le dépôt `shop` ne contient aucun fichier suivi et n'a encore aucun commit.

Pour avancer, il me faudrait :
1. **Où se trouve la page des tarifs ?** Peut-être dans un autre dossier ou sur une autre branche, ou sur un CMS ou un outil no-code (Shopify, Webflow…).
2. **Quel texte veux-tu mettre ?** Tu peux me donner le nouveau contenu (titres, descriptions des offres, prix, appels à l'action). Tu peux aussi me demander de le rédiger : dans ce cas, dis-moi les offres, les prix et le ton souhaité.

Si tu veux, je peux aussi créer la page de zéro, avec un texte orienté conversion.
```

## B16-voluntary-switch

```text
Le dépôt `shop` est vide pour l'instant, donc je ne connais pas encore ta stack. Voici une proposition en **Node.js + Express** (TypeScript). Je peux l'adapter à FastAPI, NestJS ou autre si tu utilises autre chose.

**`src/routes/health.ts`**
```ts
import { Router, Request, Response } from "express";

const router = Router();
const startedAt = Date.now();

// Liveness : le process répond
router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? "dev",
  });
});

// Readiness : les dépendances sont joignables
router.get("/health/ready", async (_req: Request, res: Response) => {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    // À remplacer par ton client DB, par ex. await db.query("SELECT 1")
    await Promise.resolve();
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = Object.values(checks).every((c) => c === "ok");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
```

**`src/app.ts`**
```ts
import express from "express";
import healthRouter from "./routes/health";

const app = express();
app.use(healthRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API listening on :${port}`
```

## B17-after-exception

```text
Je n'ai pas pu corriger le webhook : le dépôt `shop` est vide. Ma recherche de fichiers n'a rien trouvé, donc il n'y a ni gestionnaire de webhook Stripe ni code qui parle de remboursements (`refund`, `charge.refunded`, `webhook`). Aucun fichier n'a été modifié.

Le code se trouve probablement ailleurs : une autre branche, un autre dossier, ou un fichier encore à créer. Pour avancer, il me faut :
- **Le chemin ou la branche** où se trouve le gestionnaire du webhook.
- **Le problème constaté** : erreur de signature, événement ignoré, remboursement non enregistré en base, double traitement, ou autre. Ton « aussi » laisse penser que tu en as parlé ailleurs, mais je n'en ai pas l'historique dans cette conversation.

Si le webhook n'existe pas encore, je peux l'écrire à partir de zéro. Dis-moi alors le framework utilisé (Express, Next.js, etc.).

🧭 OnThread · exception : Intégration Stripe
```

## B17b-continue-here-flow

```text
Cette demande ressemble plutôt à ta conversation « Intégration Stripe » (paiements, webhooks, remboursements). On continue ici quand même ?

🧭 OnThread · question : Intégration Stripe

--- user: Oui, continue ici. ---

Je ne peux rien corriger pour l'instant : le dépôt `shop` ne contient aucun fichier. Aucun fichier n'est suivi et aucune recherche ne trouve « stripe » dans le code. Il n'y a pas non plus d'historique Git.

Pour avancer, il me faudrait :
1. **L'emplacement du code** : est-il dans un autre dossier ou sur une branche à récupérer ?
2. **Le symptôme** : par exemple des paiements réussis sur Stripe mais toujours « en attente » en base, des webhooks qui ne sont pas reçus ou qui sont rejetés (erreur de signature), ou des doublons.
3. **Les logs ou messages d'erreur**, si tu en as.

🧭 OnThread · exception : Intégration Stripe
```

## C25-english-confusion

```text
This looks like it belongs in your "Stripe integration" conversation, which covers payments, webhooks and refunds. Do you want to continue here anyway?

🧭 OnThread · question : Stripe integration
```

## C26-mixed-languages

```text
Cette demande colle plutôt à ta conversation « Stripe integration » (paiements, webhooks, remboursements), alors que celle-ci porte sur le marketing. On continue ici quand même ?

🧭 OnThread · question : Stripe integration
```

## A-first-message-topic

```text
Le dépôt `shop` est vide pour l'instant. Il n'y a ni code ni stack définie, donc je ne peux rien brancher sur l'existant. Avant d'écrire quoi que ce soit, j'ai besoin de quelques précisions.

**1. Technique**
- Quelle stack voulez-vous utiliser ? Par exemple Node/TypeScript, Python/Django, PHP/Laravel ou Shopify/WooCommerce. Ou bien le code de la boutique est-il dans un autre dépôt ?
- Quelle base de données ? PostgreSQL, MySQL, SQLite… ?

**2. Règles du programme**
- **Gain de points** : par exemple 1 point par euro dépensé. Faut-il aussi des bonus (inscription, anniversaire, avis, parrainage) ?
- **Utilisation** : par exemple 100 points = 5 € de réduction. Les points peuvent-ils aussi servir à obtenir des produits offerts ?
- **Expiration** : les points expirent-ils, par exemple au bout de 12 mois ?
- **Niveaux** : voulez-vous des paliers (Bronze, Argent, Or) avec des avantages différents ?
- **Remboursements** : faut-il retirer les points gagnés quand une commande est remboursée ?

**Ce que je propose par défaut** si vous n'avez pas de préférence :
- Les points sont gagnés une fois le paiement confirmé, pas à la commande.
- Chaque mouvement de points est enregistré dans un historique, et le solde est calculé à partir de cet historique. Cela simplifie les remboursements, l'expiration et les audits.
- Une API pour consulter son solde et utiliser ses points au moment du paiement.

Donnez-moi la stack et vos règles, et je mets en place le modèle de données, la logique et les t
```
