# Directives de fonctionnement ZUBIKS SERVICE

1. **Environnement de développement privilégié** :
   - URL de dev locale fonctionnelle : `http://localhost:8000/public/`
   - Le serveur PHP de dev tourne sur le port 8000 (`php -S localhost:8000`).

2. **Règles d'opérations financières (Dépôts & Retraits)** :
   - **Retraits** :
     - Montant minimum par transaction : **62 000 Fc** (minimum absolu fixe quel que soit le nombre de parts).
     - Autorisation de retrait même en début de cycle : un membre ayant payé pour 1, 2 ou 3 jours peut retirer un montant supérieur à ses dépôts (ex: 62 000 Fc pour 1 part, 124 000 Fc pour 2 parts) tant que le cumul ne dépasse pas son plafond.
     - Plafond maximal cumulé par cycle : **62 000 Fc × nombre de parts** (ex: 124 000 Fc pour 2 parts).
   - **Dépôts** :
     - Dépôt minimum : 1 000 Fc.
     - Cumul maximal de dépôt par cycle (63 jours) : **63 000 Fc × nombre de parts**.

3. **Messagerie Client - Admin & Notifications automatiques** :
   - Interface Admin Messagerie ultra-réactive avec auto-sélection de la première conversation active (évite les blocages / écrans figés).
   - À chaque dépôt ou retrait validé par l'administration, le système génère automatiquement :
     a) Une notification utilisateur enregistrée dans `members.notifications`.
     b) Un message de confirmation automatique dans la messagerie support (`messages`).
   - La messagerie et le système de notifications restent fluides, réactifs et synchronisés entre le panneau d'administration et l'espace client.

4. **Intégrité de la Base de Données (MySQL - `zubiks_db`)** :
   - Résolution canonique des membres par ID et par Nom pour garantir la correspondance exacte des messages, notifications et historiques de transactions.
