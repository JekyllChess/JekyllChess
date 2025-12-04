---
title: JekyllChess
layout: default
---

<h1><a href="{{ baseurl }}"><img src="/assets/favicon.png" /> {{ site.title }}</a></h1>



{% for post in site.posts %}

<article class='post'>
  <h1 class='post-title'>
    <a href="{{ site.path }}{{ post.url }}">
      {{ post.title }}
    </a>
  </h1>
  <fen>{{ post.FEN }}</fen>
  {{ post.excerpt }}
</article>

{% endfor %}
