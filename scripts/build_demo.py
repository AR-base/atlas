"""Builds the fictional "Nexa Digital" demo data for Atlas.

Outputs (in public/data/):
  demo.sql   SQLite schema + rows, loaded in the browser by sql.js
  docs.json  the company documents (from demo/docs/*.md)
  code.json  the demo codebase (from demo/nexa-gestion/)

Deterministic (fixed seed), so the planted findings are always the same:
  - invoices overdue more than 30 days with no reminder (procedure says J+30, code waits 45)
  - support tickets older than 24 months still stored (GDPR policy says delete)
  - two duplicated clients, three invoices whose TTC amount is wrong,
    two tickets resolved before they were opened, projects without a manager
Run: python3 scripts/build_demo.py
"""
from __future__ import annotations

import json
import pathlib
import random
from datetime import date, datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
TODAY = date(2026, 10, 15)
rnd = random.Random(20261019)


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(round(v, 2)) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"


SCHEMA = """
CREATE TABLE employes (
  id INTEGER PRIMARY KEY, prenom TEXT NOT NULL, nom TEXT NOT NULL, poste TEXT NOT NULL,
  equipe TEXT NOT NULL, date_embauche TEXT NOT NULL, email TEXT NOT NULL
);
CREATE TABLE clients (
  id INTEGER PRIMARY KEY, raison_sociale TEXT NOT NULL, secteur TEXT, ville TEXT,
  segment TEXT CHECK (segment IN ('TPE','PME','ETI')), statut TEXT, date_creation TEXT, contact_email TEXT
);
CREATE TABLE projets (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), nom TEXT NOT NULL,
  type TEXT NOT NULL, chef_projet_id INTEGER REFERENCES employes(id), date_debut TEXT NOT NULL,
  date_fin_prevue TEXT, date_fin_reelle TEXT, budget_ht REAL, statut TEXT
);
CREATE TABLE factures (
  id INTEGER PRIMARY KEY, numero TEXT NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id),
  projet_id INTEGER REFERENCES projets(id), date_emission TEXT NOT NULL, date_echeance TEXT NOT NULL,
  montant_ht REAL NOT NULL, montant_ttc REAL NOT NULL, statut TEXT NOT NULL,
  date_paiement TEXT, nb_relances INTEGER NOT NULL DEFAULT 0, derniere_relance TEXT
);
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), projet_id INTEGER REFERENCES projets(id),
  titre TEXT NOT NULL, categorie TEXT NOT NULL, priorite TEXT NOT NULL, statut TEXT NOT NULL,
  date_ouverture TEXT NOT NULL, date_resolution TEXT, assigne_a INTEGER REFERENCES employes(id)
);
CREATE TABLE temps_passe (
  id INTEGER PRIMARY KEY, employe_id INTEGER NOT NULL REFERENCES employes(id),
  projet_id INTEGER NOT NULL REFERENCES projets(id), date TEXT NOT NULL, heures REAL NOT NULL, activite TEXT
);
"""

EMPLOYES = [
    ("Camille", "Lefèvre", "Directrice", "Commercial & Gestion"), ("Hugo", "Moreau", "Chef de projet", "Web"),
    ("Léa", "Girard", "Cheffe de projet", "Mobile"), ("Nathan", "Roux", "Développeur back-end", "Web"),
    ("Inès", "Fournier", "Développeuse front-end", "Web"), ("Lucas", "Bonnet", "Développeur mobile", "Mobile"),
    ("Chloé", "Lambert", "Designer UX/UI", "Web"), ("Maxime", "Fontaine", "Administrateur systèmes", "Support & Infogérance"),
    ("Sarah", "Chevalier", "Technicienne support", "Support & Infogérance"), ("Théo", "Robin", "Technicien support", "Support & Infogérance"),
    ("Manon", "Gauthier", "Chargée de comptes", "Commercial & Gestion"), ("Antoine", "Perrin", "Chef de projet", "Web"),
    ("Julie", "Mercier", "Consultante SEO", "Web"), ("Yanis", "Blanc", "Développeur full-stack", "Mobile"),
]
CHEFS = [2, 3, 12]
SUPPORT = [8, 9, 10]

SECTEURS = ["Boulangerie", "Cabinet comptable", "Garage automobile", "Hôtel", "Restaurant", "Pharmacie", "Agence immobilière",
            "Cave à vins", "Clinique vétérinaire", "Menuiserie", "Salle de sport", "École de musique", "Fromagerie",
            "Cabinet d'avocats", "Transport", "Fleuriste", "Librairie", "Opticien", "Plomberie", "Imprimerie"]
NOMS = ["Martin", "Bernard", "Dubois", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Michel", "Garcia",
        "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard", "André", "Mercier", "Dupont",
        "Lambert", "Bonnet", "François", "Martinez", "Legrand", "Garnier", "Faure", "Rousseau", "Blanc", "Guerin",
        "Muller", "Henry", "Roussel", "Nicolas", "Perrin", "Morin", "Mathieu", "Clement", "Gauthier", "Dumont",
        "Lopez", "Fontaine", "Chevalier"]
VILLES = ["Angers", "Nantes", "Le Mans", "Cholet", "Saumur", "Laval", "Tours", "Rennes", "La Roche-sur-Yon", "Trélazé"]
TYPES = [("Site vitrine", 2500, 6000), ("E-commerce", 8000, 22000), ("Application mobile", 15000, 40000),
         ("Logiciel de gestion", 12000, 30000), ("Maintenance", 1080, 3600), ("SEO / réseaux sociaux", 1800, 7200),
         ("Formation", 650, 3900)]
TICKET_TITRES = {
    "bug": ["Erreur 500 sur la page panier", "Formulaire de contact ne s'envoie plus", "Images non affichées sur mobile",
            "Menu cassé sur Safari", "Export PDF des devis incorrect"],
    "demande": ["Ajouter une page Actualités", "Changer les horaires d'ouverture", "Nouvel utilisateur à créer",
                "Modifier les tarifs en ligne", "Ajouter un moyen de paiement"],
    "incident": ["Site inaccessible", "Lenteurs importantes", "Certificat SSL expiré", "Sauvegarde échouée", "Boîte mail saturée"],
    "question": ["Comment ajouter un produit ?", "Accès aux statistiques de visite", "Facture en double ?",
                 "Procédure de mise à jour", "Comment réinitialiser un mot de passe ?"],
    "securite": ["Tentatives de connexion suspectes", "E-mail d'hameçonnage reçu", "Compte administrateur bloqué",
                 "Fichier suspect sur le serveur"],
}
SLA_H = {"critique": 4, "haute": 24, "normale": 72, "basse": 240}


def d(x: date) -> str:
    return x.isoformat()


def dt(x: datetime) -> str:
    return x.strftime("%Y-%m-%d %H:%M:%S")


def build_sql() -> tuple[str, dict]:
    lines = [SCHEMA.strip()]
    facts = {}

    # employees
    for i, (p, n, poste, eq) in enumerate(EMPLOYES, 1):
        hired = date(2014, 9, 1) + timedelta(days=rnd.randint(0, 3800))
        email = f"{p.lower()}.{n.lower()}@nexa-digital.example".replace("é", "e").replace("è", "e").replace("ï", "i").replace("ë", "e")
        lines.append(f"INSERT INTO employes VALUES ({i},{q(p)},{q(n)},{q(poste)},{q(eq)},{q(d(min(hired, TODAY)))},{q(email)});")

    # clients (43 + 2 duplicates)
    clients = []
    for i in range(1, 44):
        sect = rnd.choice(SECTEURS)
        name = f"{sect} {NOMS[i - 1]}"
        seg = rnd.choices(["TPE", "PME", "ETI"], [6, 3, 1])[0]
        statut = rnd.choices(["actif", "inactif", "prospect"], [7, 2, 1])[0]
        created = date(2015, 1, 1) + timedelta(days=rnd.randint(0, 3900))
        email = f"contact@{NOMS[i - 1].lower()}-{sect.split()[0].lower()}.example".replace("é", "e").replace("'", "")
        if i in (17, 31):
            email = None  # missing contact e-mail
        clients.append((i, name, sect, rnd.choice(VILLES), seg, statut, d(min(created, TODAY)), email))
    # planted duplicates of clients 1 and 5 (same e-mail, slightly different name)
    for src_id, new_id in ((1, 44), (5, 45)):
        c = clients[src_id - 1]
        clients.append((new_id, c[1] + " SARL", c[2], c[3], c[4], "actif", c[6], c[7]))
    for c in clients:
        lines.append("INSERT INTO clients VALUES (" + ",".join(q(v) for v in c) + ");")
    facts["duplicate_clients"] = [(1, 44), (5, 45)]

    # projects
    projets = []
    pid = 0
    for c in clients[:43]:
        if c[5] == "prospect":
            continue
        for _ in range(rnd.choice([1, 1, 2, 2, 3])):
            pid += 1
            typ, lo, hi = rnd.choice(TYPES)
            start = date(2023, 1, 9) + timedelta(days=rnd.randint(0, 1300))
            if start > TODAY - timedelta(days=10):
                start = TODAY - timedelta(days=rnd.randint(10, 120))
            planned = start + timedelta(days=rnd.randint(20, 160))
            budget = round(rnd.uniform(lo, hi) / 50) * 50
            if planned < TODAY - timedelta(days=5):
                late = rnd.random() < 0.28
                real = planned + timedelta(days=rnd.randint(5, 45)) if late else planned - timedelta(days=rnd.randint(0, 10))
                statut = "livre" if real <= TODAY else "en_retard"
                real_s = d(real) if real <= TODAY else None
            else:
                statut, real_s = "en_cours", None
            if rnd.random() < 0.03:
                statut, real_s = "annule", None
            chef = rnd.choice(CHEFS)
            if pid in (7, 23, 58):
                chef = None  # project without a manager (procedure says one is always assigned)
            projets.append((pid, c[0], f"{typ} {c[1].split()[-1]}", typ, chef, d(start), d(planned), real_s, float(budget), statut))
    for p in projets:
        lines.append("INSERT INTO projets VALUES (" + ",".join(q(v) for v in p) + ");")

    # invoices
    fid = 0
    year_seq = {}
    wrong_ttc, overdue_no_reminder = [], []
    for p in projets:
        if p[9] == "annule":
            continue
        n_inv = 1 if p[3] in ("Formation", "Site vitrine") else rnd.choice([2, 3, 3, 4])
        start = date.fromisoformat(p[5])
        for k in range(n_inv):
            emitted = start + timedelta(days=15 + k * rnd.randint(25, 70))
            if emitted > TODAY - timedelta(days=2):
                break
            fid += 1
            y = emitted.year
            year_seq[y] = year_seq.get(y, 0) + 1
            numero = f"F-{y}-{year_seq[y]:04d}"
            ht = round(p[8] / n_inv, 2)
            ttc = round(ht * 1.2, 2)
            if fid in (41, 133, 260):
                ttc = round(ht * 1.196, 2)  # wrong VAT computation
                wrong_ttc.append(fid)
            due = emitted + timedelta(days=30)
            paid = None
            nb_rel, last_rel = 0, None
            if due < TODAY:
                r = rnd.random()
                if r < 0.80:
                    paid_d = due + timedelta(days=rnd.randint(-12, 25))
                    if paid_d > TODAY:
                        paid_d = TODAY - timedelta(days=1)
                    paid = d(paid_d)
                    statut = "payee"
                    if paid_d > due + timedelta(days=45):
                        nb_rel, last_rel = 1, d(due + timedelta(days=45))
                else:
                    statut = "en_retard"
                    late_days = (TODAY - due).days
                    if late_days >= 45:  # the code only reminds from day 45
                        nb_rel, last_rel = 1, d(due + timedelta(days=45))
                    elif late_days > 30:
                        overdue_no_reminder.append(fid)
            else:
                statut = "en_attente"
            lines.append("INSERT INTO factures VALUES (" + ",".join(q(v) for v in (
                fid, numero, p[1], p[0], d(emitted), d(due), ht, ttc, statut, paid, nb_rel, last_rel)) + ");")
    # make sure the demo always shows a few invoices 31–44 days overdue with no reminder
    for k, days_late in enumerate((33, 38, 41, 44)):
        fid += 1
        p = projets[(k * 7) % len(projets)]
        due = TODAY - timedelta(days=days_late)
        emitted = due - timedelta(days=30)
        y = emitted.year
        year_seq[y] = year_seq.get(y, 0) + 1
        ht = float(round(rnd.uniform(900, 4800) / 10) * 10)
        lines.append("INSERT INTO factures VALUES (" + ",".join(q(v) for v in (
            fid, f"F-{y}-{year_seq[y]:04d}", p[1], p[0], d(emitted), d(due), ht, round(ht * 1.2, 2), "en_retard", None, 0, None)) + ");")
        overdue_no_reminder.append(fid)
    facts["wrong_ttc_invoices"] = wrong_ttc
    facts["overdue_31_44_no_reminder"] = overdue_no_reminder

    # tickets
    tid = 0
    old_tickets = 0
    bad_dates = []
    active = [p for p in projets if p[9] != "annule"]
    for _ in range(620):
        tid += 1
        p = rnd.choice(active)
        cat = rnd.choices(list(TICKET_TITRES), [30, 25, 15, 25, 5])[0]
        prio = "critique" if cat == "securite" else rnd.choices(["basse", "normale", "haute", "critique"], [25, 45, 22, 8])[0]
        opened = datetime(2023, 3, 1, 8) + timedelta(minutes=rnd.randint(0, int((datetime(2026, 10, 14) - datetime(2023, 3, 1)).total_seconds() // 60)))
        opened = opened.replace(hour=rnd.randint(8, 18))
        sla = SLA_H[prio]
        within = rnd.random() < {"critique": 0.78, "haute": 0.86, "normale": 0.93, "basse": 0.95}[prio]
        hours = rnd.uniform(0.3, sla * 0.95) if within else rnd.uniform(sla * 1.05, sla * 3)
        resolved = opened + timedelta(hours=hours)
        if resolved > datetime(2026, 10, 15, 9):
            statut, res_s = rnd.choice(["ouvert", "en_cours"]), None
        else:
            statut, res_s = rnd.choices(["resolu", "ferme"], [3, 7])[0], dt(resolved)
        if tid in (88, 412) and res_s:
            res_s = dt(opened - timedelta(hours=rnd.randint(2, 30)))  # resolved before opened
            bad_dates.append(tid)
        if opened.date() < TODAY - timedelta(days=730):
            old_tickets += 1
        lines.append("INSERT INTO tickets VALUES (" + ",".join(q(v) for v in (
            tid, p[1], p[0], rnd.choice(TICKET_TITRES[cat]), cat, prio, statut, dt(opened), res_s, rnd.choice(SUPPORT))) + ");")
    facts["tickets_older_than_24_months"] = old_tickets
    facts["tickets_resolved_before_opened"] = bad_dates

    # time tracking
    team_by_type = {"Application mobile": [6, 14, 3], "E-commerce": [4, 5, 7, 2], "Site vitrine": [5, 7, 12],
                    "Logiciel de gestion": [4, 14, 12], "Maintenance": [8, 9, 10], "SEO / réseaux sociaux": [13, 7],
                    "Formation": [9, 11]}
    activites = ["Développement", "Réunion client", "Conception", "Tests", "Déploiement", "Support", "Rédaction"]
    eid = 0
    for p in active:
        start = date.fromisoformat(p[5])
        end = date.fromisoformat(p[7]) if p[7] else min(TODAY, date.fromisoformat(p[6]) + timedelta(days=20))
        span = max((end - start).days, 1)
        for _ in range(rnd.randint(6, 22)):
            eid += 1
            lines.append("INSERT INTO temps_passe VALUES (" + ",".join(q(v) for v in (
                eid, rnd.choice(team_by_type[p[3]]), p[0], d(start + timedelta(days=rnd.randint(0, span))),
                float(rnd.choice([1, 2, 3, 3.5, 4, 6, 7])), rnd.choice(activites))) + ");")

    facts["counts"] = {"employes": len(EMPLOYES), "clients": len(clients), "projets": len(projets),
                       "factures": fid, "tickets": tid, "temps_passe": eid}
    return "\n".join(lines) + "\n", facts


def bundle_docs() -> list[dict]:
    docs = []
    for path in sorted((ROOT / "demo" / "docs").glob("*.md")):
        text = path.read_text(encoding="utf-8")
        title = text.splitlines()[0].lstrip("# ").strip()
        docs.append({"id": path.stem, "title": title, "source": "demo", "text": text})
    return docs


def bundle_code() -> dict:
    base = ROOT / "demo" / "nexa-gestion"
    files = []
    for path in sorted(base.rglob("*")):
        if path.is_file():
            files.append({"path": path.relative_to(base).as_posix(), "text": path.read_text(encoding="utf-8")})
    return {"name": "nexa-gestion", "label": "Nexa Gestion (dépôt de démonstration)", "files": files}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    sql, facts = build_sql()
    (OUT / "demo.sql").write_text(sql, encoding="utf-8")
    (OUT / "docs.json").write_text(json.dumps(bundle_docs(), ensure_ascii=False), encoding="utf-8")
    (OUT / "code.json").write_text(json.dumps(bundle_code(), ensure_ascii=False), encoding="utf-8")
    (ROOT / "test" / "demo-facts.json").write_text(json.dumps(facts, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(facts, ensure_ascii=False))
