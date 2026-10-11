# BIG JOHN INTL 自動投稿 — 設定チェックリスト

⚠ = BasShuでつまずいた箇所

## 1. GitHub
- [ ] woolly-jp(個人アカウント)で右上「+」→ New repository。**公開**(Public)で作る。⚠ **Repository name** 欄に `bigjohn-intl-reel`(Description欄ではない)
- [ ] zipを解凍し、`bigjohn-intl-reel` フォルダを開いて **中身だけ** をドラッグ。⚠ 中にもう1つ `bigjohn-intl-reel` ができたら入れ子
- [ ] ⚠ `.github` は入らないので、Add file → Create new file で `.github/workflows/reel.yml` を作り、中身を貼る
- [ ] Settings → Pages: `main` / `/docs`。公開先は `https://woolly-jp.github.io/bigjohn-intl-reel/`

## 2. Apps Script(BIG JOHN INTL専用の新しいプロジェクト)
- [ ] script.new で新規作成、名前「BIG JOHN INTL自動投稿」。`Code.gs`、`Review.html` を貼る
- [ ] ⚠ `appsscript.json` は「プロジェクトの設定」→「appsscript.json を表示」にチェックしてから貼る
- [ ] `setup` を実行 → ログの「合言葉」を控える(チャットには貼らない)。管理シートの「投稿曜日」が **空** のままか確認
- [ ] 管理シート「設定」に「スタッフのメール」を入れる
- [ ] デプロイ → 新しいデプロイ → ウェブアプリ。⚠ アクセスは最初から **「全員」**
- [ ] ⚠ URLに `/a/macros/ドメイン名/` が入っていたら `/macros/` に縮める → 同じURLを ① GitHubの `WEBAPP_URL` ② 管理シートの「確認画面URL」に入れる
- [ ] ⚠ シークレット ウィンドウでそのURLを開き、「投稿の確認」が出るか確認
- [ ] GitHub → Settings → Secrets → Actions に `WEBAPP_URL` と `WEBAPP_KEY`(合言葉。スクリプト プロパティの `WEBAPP_KEY` でも見られる)
- [ ] ⚠ 以後コードを差し替えたら「デプロイを管理 → 鉛筆 → 新バージョン」

## 3. AIの接続
- [ ] console.anthropic.com で BIG JOHN INTL 用のAPIキーを新しく作る
- [ ] スクリプト プロパティ `ANTHROPIC_API_KEY` に入れ、`testAI` →「AIに接続できました」

## 4. 使用シーンの写真の判定
- [ ] `suggestScenePhotos` を「残り0件」になるまでくり返す(約240件。数回かかる)
- [ ] 「商品」シートの「使用シーンの写真番号」「季節」をざっと見て、違うものだけ直す

## 5. 最初の1本
- [ ] `makeNow` を実行 → GitHub の Actions →「動画づくり」→ Run workflow
- [ ] メールの確認画面で、動画・英語キャプション・日本語訳が出るか確認(まだ「投稿する」は押さない)
- [ ] もう一度 `makeNow` → Run workflow。2本目はカルーセル(写真が横に並ぶ)になるか確認

## 6. Instagram(@bigjohn.jeans_intl)
- [ ] プロアカウント(ビジネス/クリエイター)か確認
- [ ] Metaアプリ「Woolly Post」→ ⚠ 左に「アプリの役割」がなければ「ユースケース → カスタマイズ → Instagramログインによる API設定 → 2. アクセストークンを生成する」の「役割」から、`bigjohn.jeans_intl` をInstagramテスターに追加
- [ ] Instagram側(アプリ → 設定 → ウェブサイトのアクセス許可 → テスターへの招待)で承認 → 開発者画面で「アカウントを追加」
- [ ] ⚠ 許可画面で「コンテンツへのアクセスと公開」が **オン** か確認
- [ ] トークンを生成し、⚠ **BIG JOHN INTL の Apps Script** のスクリプト プロパティ `IG_TOKEN` に入れる(他ブランドのプロジェクトに入れない)
- [ ] `testInstagram` →「接続できました: @bigjohn.jeans_intl」
- [ ] 確認画面で「投稿する」。権限エラーなら `diagInstagram` を実行してから押し直す
- [ ] 管理シートの「投稿曜日」に `月,水,金` を入れる(ここから自動作成が始まる)
