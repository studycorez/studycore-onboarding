import os
import sys
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_KEY env vars")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

STUDENTS = [
    ("Sanjana", "sanjana07m@gmail.com", "Dmeera18@gmail.com"),
    ("Medha", "medhatheartist@gmail.com", "priya_anantuni@hotmail.com"),
    ("Arinze", "cathycheks2005@gmail.com", "desinwafor99@yahoo.com"),
    ("Dikshant Ahuja", "Dikshant.ahuja061609@gmail.com", "deepakahuja_mit96@yahoo.com"),
    ("Mide", "aderoba1446@gmail.com", "yinky22@gmail.com"),
    ("Aadhya", "adhyaganatra1@gmail.com", "harsha.us@gmail.com"),
    ("Isha", "ishaganatra1@gmail.com", "harsha.us@gmail.com"),
    ("Sid Iyer", "sid.iyer2008@gmail.com", "mala.ramakrishnan@gmail.com"),
    ("Arush Roy", "royarush08@gmail.com", "anjanroy77@yahoo.com"),
    ("Derin", "dakintide09@gmail.com", "jakintide@gmail.com"),
    ("Santiago", "santiagoaperez@icloud.com", "roselenaperez@hotmail.com"),
    ("Sara Kalangi", "kalangisara@gmail.com", "zehrakalangi@icloud.com"),
    ("Aanya", "aanyasheth@gmail.com", None),
    ("Eli Z", "metropolitans13@yahoo.com", "metropolitans13@yahoo.com"),
    ("David", "davidbogart09@gmail.com", "nataliya_77@hotmail.com"),
    ("Javyn", "jj4196@pleasantonusd.net", None),
    ("Snehansh", "snehanshb@gmail.com", "kantit123@gmail.com"),
    ("Monica", "monicaalomba@gmail.com", "siriche80@gmail.com"),
    ("Arham", "arhamusman450@gmail.com", "humamah_zuhra@yahoo.com"),
    ("Enakshi", "enakshibansal1@outlook.com", "annugup84@gmail.com"),
    ("Somesh", "1118194@apps.nsd.org", "addatmyhome@gmail.com"),
    ("Tanishi", "tanishi.paathak@gmail.com", "harish.pathak@gmail.com"),
    ("Adam Hamid", "hamid_adam@aol.com", "thehamid123@aol.com"),
    ("Harshith", "harshithkothapalli.25@gmail.com", "imeduri79@gmail.com"),
    ("Abbie", "abbiepongpat2@gmail.com", "tompongpat426@gmail.com"),
    ("Avleen", "gahuniaavleen@gmail.com", "mdms05@hotmail.com"),
    ("Om", "omvyas.0601@gmail.com", "urvi.mankad@gmail.com"),
    ("Sara", "Sapie0520@gmail.com", "heatherjoy122@gmail.com"),
    ("Ved", "vedrangarej0@gmail.com", "rangarej@gmail.com"),
    ("Muzammil", "syedp4463@gmail.com", "syedp4463@gmail.com"),
    ("Justin", "Justin.shah2008@gmail.com", None),
    ("Maz", "4maaz.k00@gmail.com", "farhan74@gmail.com"),
    ("Shaan", "shaan872009@gmail.com", "kajalpatel20@gmail.com"),
    ("Arnav", "arnav2907mishra@gmail.com", None),
    ("Savannah", "27collsa@dextersouthfield.org", "georgia_wright43@yahoo.com"),
    ("Javet", "jwongkaren27@llastudent.org", "qperdon@yahoo.com"),
    ("Colby", "Burtonparty5@gmail.com", None),
    ("Moin", "moinmkhan15@gmail.com", "urkareema@gmail.com"),
    ("Nicholas", "ntzaccagnino@gmail.com", None),
    ("Muhammad", "syeda.nida.haider@gmail.com", "syeda.nida.haider@gmail.com"),
    ("Susannah", "susannah.rockers@gmail.com", "kimberly.rockers@gmail.com"),
    ("Abi", "fola80@gmail.com", "fola80@gmail.com"),
    ("Olivia", "oliviapark222@icloud.com", "cerissapark@gmail.com"),
    ("Nicolai", "nicolaidefreest@gmail.com", "defreest@gmail.com"),
    ("Saisaran", "Saisaranvk@gmail.com", "vaish.rv83@gmail.com"),
    ("Radhae", "radhaeganesh@gmail.com", None),
    ("Pierre DeFelice", "defelicepierre34@gmail.com", "jillcg91@yahoo.com"),
    ("Sophia", "scwinard@gmail.com", "AWindard@HoustonISD.org"),
    ("Saanvi Sunil", "saanvisunil027@gmail.com", None),
    ("Vishnu", "vishnu.chheda@gmail.com", "kumar.chheda@gmail.com"),
    ("Ann Sherman", "asherman76572@gmail.com", "nnebblett@hotmail.com"),
    ("Miracle Brown", "queenmimi1518@gmail.com", "folashade.brown@yahoo.com"),
    ("Prisha Kolhe", "prishakolhe@icloud.com", "pradnya_sunil@yahoo.com"),
    ("Emily", "emily123a@outlook.com", "zudiet@gmail.com"),
    ("Kai Rosen", "kairosen@gmail.com", "calleyat@aol.com"),
    ("Roopkatha", "angel48b@gmail.com", "rbnyc@hotmail.com"),
    ("Isabel Villarreal", "isabelmvill12@gmail.com", "jenmpackard@gmail.com"),
    ("Krish Jariwala", "Krish2008j@gmail.com", "payal79j@gmail.com"),
    ("Lauren", "camillamorningstar777@gmail.com", "pdsmd1@hotmail.com"),
    ("Milana", "mlabkovich@gmail.com", "labkovich.alena@gmail.com"),
    ("Jessica", "ayissijessica9@gmail.com", "drayissild@gmail.com"),
    ("Rishi", "rishi.yadavalli10@gmail.com", "priya.yadavalli@gmail.com"),
    ("Aarini", "aarinin04@gmail.com", "debbani11@yahoo.com"),
    ("Aditri Sikdar", "aditrisikdar14@gmail.com", None),
    ("Kai Judex", "Kai.judex@gmail.com", "angeline.judex@gmail.com"),
    ("Addy", "addy.jane.hill@gmail.com", "beth.clauss@gmail.com"),
    ("Bhargav", "bhargavpadhi09@gmail.com", "umapadhi2008@gmail.com"),
    ("Mya Hill", "myarihll@aol.com", "wdrhll@aol.com"),
    ("Vijay", "Vijayvanaparthy201011@gmail.com", "rvanap@gmail.com"),
    ("Vineel", "vineelm128@gmail.com", "atchutb@gmail.com"),
    ("Nnaallah", "nnaallahj@gmail.com", "ogeanazia123@gmail.com"),
    ("Alec", "alecjosetoledo@gmail.com", "jackievtoledo@gmail.com"),
    ("Setaya", "smotarjem27@hb.edu", "reza.motarjem@gmail.com"),
    ("Chisom", "chizm.eze@gmail.com", "winich12@yahoo.com"),
    ("Shreya", "shreyasamba19@gmail.com", "s_navin@hotmail.com"),
    ("Anaya", "anayaabraham29@gmail.com", "bencyab@hotmail.com"),
    ("Sydney", "simone.willingham1202@gmail.com", "simonew2015@att.net"),
    ("Brittany", "brittany.lilly2008@gmail.com", "donald.lilly1@gmail.com"),
    ("Askari", "askarinaqvi2008@gmail.com", "hussain_syed1@yahoo.com"),
    ("Emerie", "emeriejsmith@gmail.com", "soniasmith23@gmail.com"),
    ("Adam Needleman", "needlemana27@fordhamprep.org", "msnmjp@gmail.com"),
    ("Saanvi Kumar", "saanvi.kumar317@gmail.com", None),
    ("Temi", "temibella.apata@gmail.com", "jatts.crew@gmail.com"),
    ("Kyle", "kyle.levi.lerman@gmail.com", "s.sheynin@gmail.com"),
    ("Pradyumn", "contactprady@gmail.com", "deeptisingh.4@gmail.com"),
    ("Raj", "rajcuddapah@gmail.com", "ncuddapah@gmail.com"),
    ("Suhani", "suhaniladdha@gmail.com", "Chanchalladdha@gmail.com"),
    ("Willfred", "wrcv9898@gmail.com", "tcamua@hotmail.com"),
    ("Nitant", "arrowbow16@gmail.com", "rash_ashwin@yahoo.co.in"),
    ("Shayne", "shayne.dalgleish@gmail.com", "ygasperino@gmail.com"),
    ("Aayush", "Aayushreddymusku@gmail.com", "lathabaddam@gmail.com"),
    ("Aiden", "aidenaponte30@gmail.com", "apontej3@hotmail.com"),
    ("Kara", "kkcrumblecookie@gmail.com", "jeanlouiseharris@yahoo.com"),
]

def normalize_name(name):
    return name.lower().strip() if name else ""

def main():
    print("Fetching all students from database...")
    result = supabase.table("students").select("id, name, email").execute()
    db_students = result.data
    print(f"Found {len(db_students)} students in DB\n")

    db_by_name = {}
    for s in db_students:
        key = normalize_name(s["name"])
        db_by_name[key] = s

    updated = 0
    skipped = 0
    not_found = []

    for (student_name, student_email, parent_email) in STUDENTS:
        norm = normalize_name(student_name)
        db_student = db_by_name.get(norm)

        if not db_student:
            for key, s in db_by_name.items():
                if norm in key or key in norm:
                    db_student = s
                    break

        if not db_student:
            not_found.append(student_name)
            continue

        current_email = db_student.get("email", "") or ""
        if "@studycore.import" not in current_email and current_email != "":
            print(f"  SKIP {student_name}: already has email {current_email}")
            skipped += 1
            continue

        update_data = {"email": student_email}
        if parent_email:
            update_data["parent_email"] = parent_email
        supabase.table("students").update(update_data).eq("id", db_student["id"]).execute()
        print(f"  OK {student_name} -> {student_email}")
        updated += 1

    print(f"\n=== SUMMARY ===")
    print(f"Updated:  {updated}")
    print(f"Skipped:  {skipped}")
    print(f"Not found: {len(not_found)}")
    if not_found:
        print("\nNot found in DB:")
        for n in not_found: print(f"  - {n}")

if __name__ == "__main__":
    main()
