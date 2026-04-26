import os, sys
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_KEY env vars"); sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

TUTORS = [
    ("Pranesh", "praneshraghavendran66@gmail.com"),
    ("David Zhu", "davidzhu314@gmail.com"),
    ("Vaishnavi", "vaishn4vik@gmail.com"),
    ("Herbert", "homboto3@gmail.com"),
    ("Daniel Ryu", "ryudaniel10@gmail.com"),
    ("Mazin", "mazin.sihweil@gmail.com"),
    ("Rachit", "rachitsurve3@gmail.com"),
    ("Aayush", "aayushdhaulakhandi@gmail.com"),
    ("Charles", "charles242006@gmail.com"),
    ("Barghav", "barghavb07@gmail.com"),
    ("Mahir", "mmlabib1050@gmail.com"),
    ("Varun", "vak4@illinois.edu"),
    ("Nikhil", "nikhil.sakthirajan@gmail.com"),
    ("Joseph", "jrv67@cornell.edu"),
    ("Oliver", "oliver.zhang0712@gmail.com"),
    ("Tanish", "tdongre100@gmail.com"),
    ("Priyam", "priyamkabra7@gmail.com"),
    ("David Salas", "davidisaacsalas@gmail.com"),
    ("Parth", "parthmpatel2025@gmail.com"),
    ("Yiyi Sun", "bluepaper1122@gmail.com"),
    ("Minju Kim", "minjugemma@gmail.com"),
    ("Samrudh Jakka", "samrudh2@illinois.edu"),
    ("Brohon Su", "brosu222@yahoo.com"),
    ("Lahari", "laharibeeram20@gmail.com"),
    ("Akshya Amar", "hereisakshya@gmail.com"),
    ("Ayush Bansal", "digital.ayubansal@gmail.com"),
    ("Vedanta", "veddas@iu.edu"),
    ("Hoon Jung", "hoonjung06@gmail.com"),
    ("Samarth", "samarth_bedre@brown.edu"),
    ("Praveen", "praveen.ramashetty@gmail.com"),
    ("Chaitan", "chaitan.katta@gmail.com"),
    ("Aarav Gupta", "aaravg0924@gmail.com"),
]

def main():
    print("Fetching existing tutors...")
    existing = supabase.table("tutors").select("id, name, email").execute().data
    print(f"Found {len(existing)} tutors in DB\n")

    by_email = {t["email"].lower(): t for t in existing if t.get("email")}
    by_name = {t["name"].lower().strip(): t for t in existing if t.get("name")}

    inserted = updated = skipped = 0

    for (name, email) in TUTORS:
        match = by_email.get(email.lower()) or by_name.get(name.lower().strip())
        if match:
            if (match.get("email") or "").lower() == email.lower():
                print(f"  SKIP {name}: already correct")
                skipped += 1
            else:
                supabase.table("tutors").update({"email": email}).eq("id", match["id"]).execute()
                print(f"  UPDATED {name} -> {email}")
                updated += 1
        else:
            supabase.table("tutors").insert({"name": name, "email": email}).execute()
            print(f"  INSERTED {name} ({email})")
            inserted += 1

    print(f"\n=== SUMMARY ===\nInserted: {inserted}\nUpdated: {updated}\nSkipped: {skipped}")

if __name__ == "__main__":
    main()
