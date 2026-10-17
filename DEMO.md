# Démonstration Atlas (5 minutes)

**Phrase d'ouverture :** « Atlas est un agent qui interroge en même temps la base de données, les documents internes et le code d'une entreprise, et qui répond avec ses sources. Ici, l'entreprise est fictive : Nexa Digital, une agence web. »

## 1. La question qui croise tout (2 min)
Cliquer : **« Notre procédure de relance des factures est-elle réellement appliquée ? »**

À montrer pendant qu'il travaille : la colonne des étapes (recherche dans les documents, recherche dans le code, requête SQL).
Ce qu'il trouve : la procédure impose une relance à **J+30**, le code attend **45 jours**, et des factures en retard de 31 à 44 jours n'ont jamais été relancées.

> « Un humain aurait dû ouvrir trois outils et comparer. L'agent l'a fait en une question, et chaque chiffre vient d'une requête visible. »

## 2. Organiser la base de données (1 min)
Cliquer : **« Organise et audite la base de données »**
Il cartographie les tables et relations, puis trouve : clients en double, factures avec une TVA erronée, tickets « résolus » avant d'être ouverts, projets sans chef de projet, et propose les corrections en SQL.

## 3. Sur leurs propres données (1 min)
Glisser un fichier Excel ou CSV (par exemple un export de factures ou de tickets) dans « Ajoutez vos fichiers », puis demander : « Analyse ce fichier et donne-moi les 3 points d'attention. »

> « Le fichier reste dans le navigateur : seuls les extraits utiles partent vers le modèle. »

## 4. Le code (1 min, si le temps le permet)
Cliquer : **« Audit de sécurité du code par rapport à notre politique »** : mot de passe SMTP en clair, bcrypt à 10 au lieu de 12, injection SQL dans la recherche de factures.
Ou charger un dépôt GitHub public dans la colonne de gauche (ex. `AR-base/bastion`).

## Questions probables
* **Et sur notre vraie base ?** Une version entreprise se connecte à leur base avec un compte en lecture seule ; l'agent ne peut jamais modifier les données (deux protections : filtre SQL + annulation systématique).
* **Le coût ?** Affiché sous chaque réponse : quelques centimes par question.
* **Pourquoi pas ChatGPT ?** ChatGPT ne voit ni leur base, ni leurs documents, ni leur code, et ne peut pas prouver ses chiffres. Atlas montre chaque requête et chaque source.
* **La sécurité ?** Instructions et outils fixés côté serveur, réponses du modèle échappées, en-têtes stricts, limitation du débit, code d'accès.
