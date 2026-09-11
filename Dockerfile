# Dockerfile — ZUBIKS SERVICE
# PHP 8.2 + Apache pour déploiement sur Render

FROM php:8.2-apache

# Extensions PHP nécessaires
RUN docker-php-ext-install pdo pdo_mysql mysqli

# Activer mod_rewrite Apache (nécessaire pour .htaccess)
RUN a2enmod rewrite

# Copier tout le projet dans le répertoire web Apache
COPY . /var/www/html/

# Configuration Apache : autoriser .htaccess et servir le projet correctement
RUN echo '<VirtualHost *:80>\n\
    DocumentRoot /var/www/html\n\
    <Directory /var/www/html>\n\
        Options Indexes FollowSymLinks\n\
        AllowOverride All\n\
        Require all granted\n\
    </Directory>\n\
    # Rediriger la racine vers /public/\n\
    RedirectMatch ^/$ /public/\n\
    ErrorLog ${APACHE_LOG_DIR}/error.log\n\
    CustomLog ${APACHE_LOG_DIR}/access.log combined\n\
</VirtualHost>' > /etc/apache2/sites-available/000-default.conf

# Permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

EXPOSE 80
