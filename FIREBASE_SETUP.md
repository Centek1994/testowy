# Konfiguracja Firebase i Firestore

## 1. Utwórz projekt

1. Otwórz [Firebase Console](https://console.firebase.google.com/).
2. Utwórz projekt, a następnie dodaj aplikację typu **Web**.
3. Skopiuj obiekt firebaseConfig.
4. Wklej jego wartości do FIREBASE_CONFIG w js/config.js.

Po uzupełnieniu co najmniej apiKey, authDomain, projectId i appId aplikacja pobiera dane wyłącznie z Cloud Firestore. Konfiguracja jest wymagana — nie ma już trybu awaryjnego opartego o plik JSON.

## 2. Włącz usługi Firebase

1. W konsoli Firebase utwórz bazę **Cloud Firestore** w trybie Production.
2. Włącz Firebase Authentication oraz dostawcę **E-mail/hasło**. Panel administratora używa tego logowania do bezpośredniego zapisu w Firestore.
3. W Firestore utwórz dokument `users/{uid}` z jedną z ról:

~~~
{ "role": "viewer" }
~~~

`viewer` ma wyłącznie odczyt i nie musi się logować, ponieważ odczyt procedur i historii jest publiczny. Dla osoby edytującej ustaw:

~~~
{ "role": "editor" }
~~~

`editor` może dodawać i edytować procedury. Administrator otrzymuje pełne zarządzanie procedurami, w tym usuwanie:

~~~
{ "role": "admin" }
~~~

## 3. Wdróż reguły

Plik firestore.rules pozwala wszystkim odczytywać procedury i historię zmian. Rola `viewer` nie może zapisywać danych; `editor` może tworzyć i edytować; tylko `admin` może usuwać procedury. Logi pozostają niemodyfikowalnym śladem audytowym.

W panelu administratora zaloguj się adresem e-mail użytkownika Firebase. Bez dokumentu `users/{uid}` z rolą `editor` albo `admin` interfejs pozostaje w trybie tylko do odczytu.

Wdróż reguły z Firebase CLI:

~~~
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
~~~

Nie umieszczaj klucza konta serwisowego, haseł ani sekretów w plikach dostępnych dla przeglądarki.

## 4. Instalacja SDK lokalnie

Projekt jest aplikacją statyczną, dlatego w przeglądarce używa oficjalnych modułów Firebase CDN. Moduły są pobierane po uruchomieniu aplikacji i konfiguracji FIREBASE_CONFIG.

Gdy Node.js i npm są dostępne, zainstaluj zadeklarowaną zależność:

~~~
npm install
~~~

Aktualna wersja SDK zadeklarowana w projekcie to 12.16.0.

## 5. Kolekcja procedures i wyszukiwanie

Każda procedura jest osobnym dokumentem w kolekcji:

~~~
procedures/{id}
~~~

Wymagane pola dokumentu to `id`, `dept`, `title`, `exec`, `steps`, `notes`, `sortOrder` i `searchPrefixes`. Aplikacja buduje `searchPrefixes` automatycznie przy dodawaniu lub edycji procedury. Pole zawiera prefiksy słów z tytułu, działu, wykonawców, kroków oraz uwag i umożliwia szybkie zapytania Firestore bez pobierania pliku JSON.

Jeżeli w projekcie istnieją wcześniejsze dane, zaimportuj je przed wdrożeniem. Zachowaj identyfikatory dokumentów i kolejność `sortOrder`, a dla każdego dokumentu dodaj `searchPrefixes`. Nieużywany plik `procedury.json` może pozostać wyłącznie jako lokalna kopia archiwalna — aplikacja go nie odczytuje.

Historia zmian jest przechowywana niezależnie w kolekcji `logs/{auto-id}`. Każdy zapis procedury dodaje atomowo wpis z datą, godziną, użytkownikiem, nazwą procedury i typem operacji (`create`, `update` albo `delete`). Nie włączaj konfiguracji Firebase w produkcji, dopóki dane i reguły nie zostaną zweryfikowane.

## 6. Automatyczny zapis i import/eksport JSON

Po zalogowaniu jako `editor` albo `admin` edycja istniejącej procedury zapisuje zmiany automatycznie po krótkiej przerwie w pisaniu. Dodawanie nowej procedury nadal wymaga kliknięcia **Zapisz w Firestore**, aby nie tworzyć pustych dokumentów.

Ekran **Ustawienia** pozwala każdemu pobrać bieżące procedury do pliku JSON. Eksport ma strukturę:

~~~json
{
  "format": "state-capitol-procedures",
  "version": 1,
  "exportedAt": "2026-08-04T12:00:00.000Z",
  "procedures": [
    {
      "id": "go-001",
      "title": "Nazwa procedury",
      "dept": "go",
      "exec": "Wykonawca",
      "steps": ["Krok 1"],
      "notes": "Uwagi",
      "sortOrder": 1
    }
  ]
}
~~~

Import jest dostępny wyłącznie dla `admin`. Akceptuje powyższy format (lub samą tablicę procedur), wymaga pól `id`, `title` i `dept`, a następnie dodaje nowe dokumenty, aktualizuje zmienione i pomija identyczne. Import **nie usuwa** procedur, których nie ma w pliku. Każde utworzenie lub aktualizacja zapisuje także wpis w `logs`.

## 7. Kopie zapasowe Firestore i odzyskiwanie

Administrator tworzy kopię z ekranu **Ustawienia**. Aplikacja zapisuje metadane w `backups/{backupId}` oraz pełny snapshot procedur w `backups/{backupId}/procedures/{procedureId}`. Snapshot obejmuje wyłącznie kolekcję `procedures`; kolekcja `logs` pozostaje niemodyfikowalnym śladem audytowym i nie jest przywracana.

Przy odzyskiwaniu aplikacja synchronizuje `procedures` dokładnie do stanu wybranej kopii: dodaje brakujące dokumenty, aktualizuje zmienione i usuwa procedury, których w kopii nie było. Potwierdzenie w interfejsie ostrzega przed tym skutkiem. Operacje odzyskiwania są rejestrowane w `logs`.

Reguły z `firestore.rules` udostępniają kolekcję `backups` wraz z jej podkolekcją wyłącznie roli `admin`. Po zmianie pliku reguł wdroż go ponownie poleceniem z kroku 3.

## 8. Jednorazowa migracja procedury.json

Po zalogowaniu kontem z rolą `admin` otwórz **Ustawienia** i wybierz **Uruchom migrację** w sekcji „Importuj procedury.json”. Importer odczytuje lokalny, archiwalny plik `procedury.json`; plik pozostaje w projekcie i nie jest usuwany.

Każda pozycja z `procedures` trafia do `procedures/{id}` z zachowaniem pól `id`, `dept`, `title`, `exec`, `steps` i `notes`. Aplikacja dodaje techniczne pola `sortOrder` oraz `searchPrefixes`, wymagane przez bieżące sortowanie i wyszukiwanie. Wpisy z tablicy `log` są zapisywane do `logs` z deterministycznym identyfikatorem `legacy-…`, dlatego kolejne uruchomienie migracji nie powieli historii.

Po zakończeniu interfejs pokazuje osobno wynik procedur i logów, a łącznie liczbę dokumentów dodanych, zaktualizowanych oraz pominiętych.
